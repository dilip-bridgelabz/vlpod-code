#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# HTTP Proxy Server, which passes requests directly onto http
# servers running on project vm's

Cookies = require('cookies')            # https://github.com/jed/cookies
async   = require('async')
winston = require('./winston-metrics').get_logger('proxy')
http_proxy = require('http-proxy')
url     = require('url')
http    = require('http')
mime    = require('mime')
ms      = require('ms')

misc    = require('smc-util/misc')
{defaults, required} = misc
theme   = require('smc-util/theme')
{DOMAIN_NAME} = theme
{VERSION_COOKIE_NAME} = require('smc-util/consts')

hub_projects = require('./projects')
auth = require('./auth')
access = require('./access')

{once} = require('smc-util/async-utils')

DEBUG2 = false

# async
server_settings = undefined
exports.init_smc_version = init_smc_version = (db) ->
    winston.debug("init_smc_version: ")
    if db.is_standby
        return
    server_settings = require('./server-settings')(db)
    if server_settings.table._state == 'init'
        winston.debug("init_smc_version: Waiting for init to finish")
        await once(server_settings.table, 'init')
    winston.debug("init_smc_version: Table now ready!", server_settings.version)

exports.version_check = (req, res, base_url) ->
    c = new Cookies(req)
    # The arbitrary name of the cookie $VERSION_COOKIE_NAME ('cocalc_version') is
    # also used in the frontend code file
    #     smc-webapp/set-version-cookie.js
    # pre Nov'19: The encodeURIComponent below is because js-cookie does
    #             the same in order to *properly* deal with / characters.
    # post Nov'19: switching to universal-cookie in the client, because it supports
    #              SameSite=none. Now, the client explicitly encodes the base_url.
    #              The cookie name is set in smc-util/misc2
    raw_val = c.get(encodeURIComponent(base_url) + VERSION_COOKIE_NAME)
    if not raw_val?
        # try legacy cookie fallback
        raw_val = c.get(encodeURIComponent(base_url) + VERSION_COOKIE_NAME + "-legacy")
    version = parseInt(raw_val)
    min_version = server_settings.version.version_min_browser
    winston.debug('client version_check', version, min_version)
    if isNaN(version) or version < min_version
        if res?
            # status code 4xx to indicate this is a client problem and not 5xx, a server problem
            # 426 means "upgrade required"
            res.writeHead(426, {'Content-Type':'text/html'})
            res.end("426 (UPGRADE REQUIRED): reload CoCalc tab or restart your browser -- version=#{version} < required_version=#{min_version}")
        return true
    else
        return false

# In the interest of security and "XSS", we strip the "remember_me" cookie from the header before
# passing anything along via the proxy.
# Nov'19: actually two cookies due to same-site changes. See https://web.dev/samesite-cookie-recipes/#handling-incompatible-clients
#         also, there was no base_url support. no clue why...
exports.strip_remember_me_cookie = (cookie) ->
    if not cookie?
        return {cookie: cookie, remember_me:undefined}
    else
        v = []
        remember_me = undefined
        for c in cookie.split(';')
            z = c.split('=')
            if z[0].trim() == auth.remember_me_cookie_name('', false)
                remember_me = z[1].trim()
            # fallback, "true" for legacy variant
            else if (not remember_me?) and (z[0].trim() == auth.remember_me_cookie_name('', true))
                remember_me = z[1].trim()
            else
                v.push(c)
        return {cookie: v.join(';'), remember_me:remember_me}

exports.target_parse_req = target_parse_req = (remember_me, url) ->
    v          = url.split('/')
    project_id = v[1]
    type       = v[2]  # 'port' or 'raw' or 'server'
    key        = remember_me + project_id + type
    internal_url = undefined   # if defined, this is the UTL called
    if type == 'port'
        key += v[3]
        port = v[3]
    else if type == 'server'
        key += v[3]
        port = v[3]
        internal_url = v.slice(4).join('/')
    return {key:key, type:type, project_id:project_id, port_number:port, internal_url:internal_url}

exports.jupyter_server_port = jupyter_server_port = (opts) ->
    opts = defaults opts,
        project_id     : required   # assumed valid and that all auth already done
        compute_server : required
        database       : required
        cb             : required   # cb(err, port)
    hub_projects.new_project(opts.project_id, opts.database, opts.compute_server).jupyter_port
        cb   : opts.cb

exports.init_http_proxy_server = (opts) ->
    opts = defaults opts,
        database       : required
        compute_server : required
        base_url       : required
        port           : required
        host           : required
    {database, compute_server, base_url} = opts

    winston.debug("init_http_proxy_server")

    winston.debug("init_smc_version: start...")
    await init_smc_version(opts.database)
    winston.debug("init_smc_version: done")

    # Checks for access to project, and in case of write access,
    # also touch's project thus recording that user is interested
    # in this project (which sets the last_active time).
    _remember_me_check_for_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            type        : 'write'     # 'read' or 'write'
            cb          : required    # cb(err, has_access)
        dbg = (m) -> winston.debug("_remember_me_check_for_access_to_project: #{m}")
        account_id    = undefined
        email_address = undefined
        has_access    = false
        hash          = undefined
        async.series([
            (cb) ->
                dbg("get remember_me message")
                x    = opts.remember_me.split('$')
                try
                    hash = auth.generate_hash(x[0], x[1], x[2], x[3])
                catch err
                    msg = "unable to generate hash from remember_me cookie = '#{opts.remember_me}' -- #{err}"
                    dbg(msg)
                    cb(msg)
                    return
                database.get_remember_me
                    hash  : hash
                    cache : true
                    cb    : (err, signed_in_mesg) =>
                        if err or not signed_in_mesg?
                            cb("unable to get remember_me from db -- #{err}")
                            dbg("failed to get remember_me -- #{err}")
                        else
                            account_id    = signed_in_mesg.account_id
                            email_address = signed_in_mesg.email_address
                            dbg("account_id=#{account_id}, email_address=#{email_address}")
                            cb()
            (cb) ->
                dbg("check if user has #{opts.type} access to project")
                if opts.type == 'write'
                    access.user_has_write_access_to_project
                        database   : database
                        project_id : opts.project_id
                        account_id : account_id
                        cb         : (err, result) =>
                            dbg("got: #{err}, #{result}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have write access to project.")
                            else
                                has_access = true
                                # Record that user is going to actively access
                                # this project.  This is important since it resets
                                # the idle timeout.
                                database.touch(account_id:account_id, project_id:opts.project_id, cb:cb)
                else
                    access.user_has_read_access_to_project
                        project_id : opts.project_id
                        account_id : account_id
                        database   : database
                        cb         : (err, result) =>
                            dbg("got: #{err}, #{result}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have read access to project.")
                            else
                                has_access = true
                                cb()

        ], (err) ->
            opts.cb(err, has_access)
        )

    _remember_me_cache = {}
    remember_me_check_for_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            type        : 'write'
            cb          : required    # cb(err, has_access)
        key = opts.project_id + opts.remember_me + opts.type
        has_access = _remember_me_cache[key]
        if has_access?
            opts.cb(false, has_access)
            return
        # get the answer, cache it, return answer
        _remember_me_check_for_access_to_project
            project_id  : opts.project_id
            remember_me : opts.remember_me
            type        : opts.type
            cb          : (err, has_access) ->
                # if cache gets huge for some *weird* reason (should never happen under normal conditions),
                # just reset it to avoid any possibility of DOS-->RAM crash attack
                if misc.len(_remember_me_cache) >= 100000
                    _remember_me_cache = {}

                _remember_me_cache[key] = has_access
                # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                # but also if the user is suddenly granted permission to the project, this should be
                # reflected within a few seconds.
                f = () ->
                    delete _remember_me_cache[key]
                if has_access
                    setTimeout(f, 1000*60*7)
                    # access lasts 7 minutes (i.e., if you revoke privs to a user they
                    # could still hit the port for this long)
                else
                    setTimeout(f, 1000*10)
                    # not having access lasts 10 seconds -- maybe they weren't logged in yet..., so don't
                    # have things broken forever!
                opts.cb(err, has_access)

    _target_cache = {}

    invalidate_target_cache = (remember_me, url) ->
        {key} = target_parse_req(remember_me, url)
        winston.debug("invalidate_target_cache: #{url}")
        delete _target_cache[key]

    target = (remember_me, url, cb) ->
        {key, type, project_id, port_number, internal_url} = target_parse_req(remember_me, url)

        t = _target_cache[key]
        if t?
            cb(false, t, internal_url)
            return

        dbg = (m) -> winston.debug("target(#{key}): #{m}")
        dbg("url=#{url}")

        tm = misc.walltime()
        host       = undefined
        port       = undefined
        project    = undefined
        async.series([
            (cb) ->
                if not remember_me?
                    # remember_me = undefined means "allow"; this is used for the websocket upgrade.
                    cb(); return

                # It's still unclear if we will ever grant read access to the raw server...
                #if type == 'raw'
                #    access_type = 'read'
                #else
                #    access_type = 'write'
                access_type = 'write'

                remember_me_check_for_access_to_project
                    project_id  : project_id
                    remember_me : remember_me
                    type        : access_type
                    cb          : (err, has_access) ->
                        dbg("finished remember_me_check_for_access_to_project (mark: #{misc.walltime(tm)}) -- #{err}")
                        if err
                            cb(err)
                        else if not has_access
                            cb("user does not have #{access_type} access to this project")
                        else
                            cb()
            (cb) ->
                compute_server.project
                    project_id : project_id
                    cb         : (err, _project) ->
                        dbg("first compute_server.project finished (mark: #{misc.walltime(tm)}) -- #{err}")
                        if err
                            cb(err)
                        else
                            project = _project
                            host = project.host
                            cb()
            (cb) ->
                if not project._kubernetes  # this is ugly -- i need to change host in case of kubernetes.
                    cb();
                    return
                project.status
                    cb : (err, status) ->
                        if err
                            cb(err)
                        else
                            if not status.ip
                                cb("must wait for project to start")
                            else
                                host = status.ip  # actual ip of the pod
                                cb()
            (cb) ->
                #dbg("determine the port")
                if type == 'port' or type == 'server'
                    if port_number == "jupyter"
                        dbg("determine jupyter_server_port")
                        jupyter_server_port
                            project_id     : project_id
                            compute_server : compute_server
                            database       : database
                            cb             : (err, jupyter_port) ->
                                dbg("got jupyter_port=#{jupyter_port}, err=#{err}")
                                if err
                                    cb(err)
                                else
                                    port = jupyter_port
                                    cb()
                    else
                        port = port_number
                        cb()
                else if type == 'raw'
                    compute_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            dbg("second compute_server.project finished (mark: #{misc.walltime(tm)}) -- #{err}")
                            if err
                                cb(err)
                            else
                                project.status
                                    cb : (err, status) ->
                                        dbg("project.status finished (mark: #{misc.walltime(tm)})")
                                        if err
                                            cb(err)
                                        else if not status['raw.port']
                                            cb("raw port not available -- project might not be opened or running")
                                        else
                                            port = status['raw.port']
                                            cb()
                else
                    cb("unknown url type -- #{type}")
            ], (err) ->
                dbg("all finished (mark: #{misc.walltime(tm)}): host=#{host}; port=#{port}; type=#{type} -- #{err}")
                if err
                    cb(err)
                else
                    t = {host:host, port:port}
                    _target_cache[key] = t
                    cb(false, t, internal_url)
                    # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                    # but also if a new user is granted permission to the project they didn't have, or the project server
                    # is restarted, this should be reflected.  Since there are dozens (at least) of hubs,
                    # and any could cause a project restart at any time, we just timeout this.
                    # This helps enormously when there is a burst of requests.
                    # Also if project restarts the raw port will change and we don't want to have
                    # fix this via getting an error.

                    # Also, if the project stops and starts, the host=ip address could change, so
                    # we need to timeout so we see that...
                    setTimeout((->delete _target_cache[key]), 30*1000)
            )

    #proxy = http_proxy.createProxyServer(ws:true)
    proxy_cache = {}
    http_proxy_server = http.createServer (req, res) ->
        tm = misc.walltime()
        {query, pathname} = url.parse(req.url, true)
        req_url = req.url.slice(base_url.length)  # strip base_url for purposes of determining project location/permissions
        if req_url == "/alive"
            res.end('')
            return

        #buffer = http_proxy.buffer(req)  # see http://stackoverflow.com/questions/11672294/invoking-an-asynchronous-method-inside-a-middleware-in-node-http-proxy

        dbg = (m) ->
            ## for low level debugging
            if DEBUG2
                winston.debug("http_proxy_server(#{req_url}): #{m}")
        dbg('got request')

        if exports.version_check(req, res, base_url)
            dbg("version check failed")
            return

        # Before doing anything further with the request on to the proxy, we remove **all** cookies whose
        # name contains "remember_me", to prevent the project backend from getting at
        # the user's session cookie, since one project shouldn't be able to get
        # access to any user's account.
        x = exports.strip_remember_me_cookie(req.headers['cookie'])
        remember_me = x.remember_me
        req.headers['cookie'] = x.cookie

        if not remember_me?
            # before giving an error, check on possibility that file is public
            public_raw req_url, query, res, (err, is_public) ->
                if err or not is_public
                    res.writeHead(500, {'Content-Type':'text/html'})
                    res.end("Please login to <a target='_blank' href='#{DOMAIN_NAME}'>#{DOMAIN_NAME}</a> with cookies enabled, then refresh this page.")

            return

        target remember_me, req_url, (err, location, internal_url) ->
            dbg("got target: #{misc.walltime(tm)}")
            if err
                public_raw req_url, query, res, (err, is_public) ->
                    if err or not is_public
                        winston.debug("proxy denied -- #{err}")
                        res.writeHead(500, {'Content-Type':'text/html'})
                        res.end("Access denied. Please login to <a target='_blank' href='#{DOMAIN_NAME}'>#{DOMAIN_NAME}</a> as a user with access to this project, then refresh this page.")
            else
                t = "http://#{location.host}:#{location.port}"
                if proxy_cache[t]?
                    # we already have the proxy server for this remote location in the cache, so use it.
                    proxy = proxy_cache[t]
                    dbg("using cached proxy object: #{misc.walltime(tm)}")
                else
                    dbg("make a new proxy server connecting to this remote location")
                    proxy = http_proxy.createProxyServer(ws:false, target:t, timeout:7000)
                    # and cache it.
                    proxy_cache[t] = proxy
                    dbg("created new proxy: #{misc.walltime(tm)}")
                    # setup error handler, so that if something goes wrong with this proxy (it will,
                    # e.g., on project restart), we properly invalidate it.
                    remove_from_cache = ->
                        delete proxy_cache[t]
                        invalidate_target_cache(remember_me, req_url)
                        proxy.close()

                    proxy.on "error", (e) ->
                        dbg("http proxy error event -- #{e}")
                        remove_from_cache()

                    proxy.on "close", ->  # only happens with websockets, but...
                        remove_from_cache()

                    # Always clear after 5 minutes.  This is fine since the proxy is just used
                    # to handle individual http requests, and the cache is entirely for speed.
                    # Also, it avoids weird cases, where maybe error/close don't get
                    # properly called, but the proxy is not working due to network issues.
                    setTimeout(remove_from_cache, 5*60*1000)

                    #proxy.on 'proxyRes', (res) ->
                    #    dbg("(mark: #{misc.walltime(tm)}) got response from the target")

                if internal_url?
                    req.url = internal_url
                proxy.web(req, res)

    winston.debug("starting proxy server listening on #{opts.host}:#{opts.port}")
    http_proxy_server.listen(opts.port, opts.host)

    # add websockets support
    _ws_proxy_servers = {}
    http_proxy_server.on 'upgrade', (req, socket, head) ->

        # Strip remember_me cookie from req used for websocket upgrade.
        req.headers['cookie'] = exports.strip_remember_me_cookie(req.headers['cookie']).cookie

        req_url = req.url.slice(base_url.length)  # strip base_url for purposes of determining project location/permissions
        dbg = (m) -> winston.debug("http_proxy_server websocket(#{req_url}): #{m}")

        if exports.version_check(req, undefined, base_url)
            dbg("websocket upgrade -- version check failed")
            return

        target undefined, req_url, (err, location, internal_url) ->
            if err
                dbg("websocket upgrade error -- #{err}")
            else
                dbg("websocket upgrade success -- ws://#{location.host}:#{location.port}")
                t = "ws://#{location.host}:#{location.port}"
                proxy = _ws_proxy_servers[t]
                if not proxy?
                    dbg("websocket upgrade #{t} -- not using cache")
                    proxy = http_proxy.createProxyServer(ws:true, target:t, timeout:0)
                    proxy.on "error", (e) ->
                        dbg("websocket proxy error, so clearing cache -- #{e}")
                        delete _ws_proxy_servers[t]
                        invalidate_target_cache(undefined, req_url)
                    _ws_proxy_servers[t] = proxy
                else
                    dbg("websocket upgrade -- using cache")
                if internal_url?
                    req.url = internal_url
                proxy.ws(req, socket, head)

    public_raw_paths_cache = {}

    public_raw = (req_url, query, res, cb) ->
        # Determine if the requested path is public (and not too big).
        # If so, send content to the client and cb(undefined, true)
        # If not, cb(undefined, false)
        # req_url = /9627b34f-fefd-44d3-88ba-5b1fc1affef1/raw/a.html
        x = req_url.split('?')
        params = x[1]
        v = x[0].split('/')
        if v[2] != 'raw'
            cb(undefined, false)
            return
        project_id = v[1]
        if not misc.is_valid_uuid_string(project_id)
            cb(undefined, false)
            return
        path = decodeURI(v.slice(3).join('/'))
        winston.debug("public_raw: project_id=#{project_id}, path=#{path}")
        public_paths = undefined
        is_public = false
        async.series([
            (cb) ->
                # Get a list of public paths in the project, or use the cached list
                # The cached list is cached for a few seconds, since a typical access
                # pattern is that the client downloads a bunch of files from the same
                # project in parallel.  On the other hand, we don't want to cache for
                # too long, since the project user may add/remove public paths at any time.
                public_paths = public_raw_paths_cache[project_id]
                if public_paths?
                    cb()
                else
                    database.get_public_paths
                        project_id : project_id
                        cb         : (err, paths) ->
                            if err
                                cb(err)
                            else
                                public_paths = public_raw_paths_cache[project_id] = paths
                                setTimeout((()=>delete public_raw_paths_cache[project_id]), 3*60*1000)  # cache a few seconds
                                cb()
            (cb) ->
                #winston.debug("public_raw -- path_is_in_public_paths(#{path}, #{misc.to_json(public_paths)})")
                if not misc.path_is_in_public_paths(path, public_paths)
                    # The requested path is not public, so nothing to do.
                    cb()
                else
                    # The requested path *is* public, so we get the file
                    # from one (of the potentially many) compute servers
                    # that has the file -- (right now this is implemented
                    # via sending/receiving JSON messages and using base64
                    # encoding, but that could change).
                    compute_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            if err
                                cb(err); return
                            project.read_file
                                path    : path
                                maxsize : 40000000   # 40MB for now
                                cb      : (err, data) ->
                                    if err
                                        cb(err)
                                    else
                                        if query.download?
                                            res.setHeader('Content-disposition', 'attachment')
                                        filename = path.slice(path.lastIndexOf('/') + 1)
                                        # see https://www.npmjs.com/package/mime
                                        mime_type = mime.lookup(filename)
                                        res.setHeader("Content-Type", mime_type)
                                        timeout = ms('10 minutes')
                                        res.setHeader('Cache-Control', "public, max-age='#{timeout}'")
                                        res.setHeader('Expires', new Date(Date.now() + timeout).toUTCString());
                                        res.write(data)
                                        res.end()
                                        is_public = true
                                        cb()
            ], (err) ->
                cb(err, is_public)
        )
