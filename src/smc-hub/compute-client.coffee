#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

require('coffee2-cache')

EXPERIMENTAL = false

if process.env.DEVEL
    console.log("compute-client: DEVEL mode")
    DEVEL = true


# id='eb5c61ae-b37c-411f-9509-10adb51eb90b';require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);global.s=s; s.project(project_id:id,cb:(e,p)->global.p=p;cidonsole.log(e)))
#
# Another example with database on local host
#
# id='7fffd5b4-d140-4a34-a960-9f71fa7fc54b';require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);global.t=s; s.project(project_id:id,cb:(e, p)->global.p=p))

# obviously don't want to trigger this too quickly, since it may mean file loss.
AUTOMATIC_FAILOVER_TIME_S = 60*3   # NOTE: actual failover is actually disabled below; instead this is the timeout for giving up on getting status.

SERVER_STATUS_TIMEOUT_S = 7  # 7 seconds

# compute-client -- a node.js client that connects to a TCP server
# that is used by the hubs to organize compute nodes

# IMPORTANT: see schema.coffee for some important information about the project states.
STATES = require('smc-util/schema').COMPUTE_STATES

fs          = require('fs')
os          = require('os')
{EventEmitter} = require('events')

async       = require('async')
winston     = require('winston')
program     = require('commander')

uuid        = require('node-uuid')

misc_node   = require('smc-util-node/misc_node')

message     = require('smc-util/message')
misc        = require('smc-util/misc')

{site_license_hook} = require('./postgres/site-license/hook')

# Set the log level
try
    winston.remove(winston.transports.Console)
    winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})
catch err
    # ignore

{defaults, required} = misc

if process.env.SMC_STORAGE?
    STORAGE = process.env.SMC_STORAGE
else if misc.startswith(require('os').hostname(), 'compute')   # my official deploy: TODO -- should be moved to conf file.
    STORAGE = 'storage0-us'
else
    STORAGE = ''
    # TEMPORARY:


#################################################################
#
# Client code -- runs in hub
#
#################################################################

###
On dev machine

require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);global.s=s)

In a project (the port depends on project):
require('smc-hub/compute-client').compute_server(dev:true, cb:(e,s)->console.log(e);global.s=s)

###
compute_server_cache = undefined
exports.compute_server = compute_server = (opts) ->
    opts = defaults opts,
        database : undefined
        base_url : ''
        dev      : false          # dev -- for single-user *development*; compute server runs in same process as client on localhost
        single   : false          # single -- for single-server use/development; everything runs on a single machine.
        kubernetes : false        # kubernetes -- monolithic cocalc-kubernetes mode
        cb       : required
    if compute_server_cache?
        opts.cb(undefined, compute_server_cache)
    else
        compute_server_cache = new ComputeServerClient(opts)

class ComputeServerClient
    constructor: (opts) ->
        opts = defaults opts,
            database : undefined
            dev      : false
            single   : false
            kubernetes : false
            base_url : ''     # base url of webserver -- passed on to local_hub so it can start servers with correct base_url
            cb       : required
        dbg = @dbg("constructor")
        dbg(misc.to_json(misc.copy_without(opts, ['cb', 'database'])))
        @_base_url = opts.base_url
        @_project_cache = {}
        @_project_cache_cb = {}
        @_dev = opts.dev
        @_single = opts.single
        @_kubernetes = opts.kubernetes
        async.series([
            (cb) =>
                @_init_db(opts, cb)
            (cb) =>
                if @database.is_standby
                    cb()
                    return
                async.parallel([
                    (cb) =>
                        @_init_storage_servers_feed(cb)
                    (cb) =>
                        @_init_compute_servers_feed(cb)
                ], cb)
        ], (err) =>
            if err
                opts.cb(err)
            else
                compute_server_cache = @
                opts.cb(err, @)
        )

    _init_db: (opts, cb) =>
        if opts.database?
            @database = opts.database
            cb()
            return
        else
            @database = require('./postgres').db(pool:1)
            @database.connect(cb:cb)

    _init_storage_servers_feed: (cb) =>
        @database.synctable
            table : 'storage_servers'
            cb    : (err, synctable) =>
                @storage_servers = synctable
                cb(err)

    _init_compute_servers_feed: (cb) =>
        @database.synctable
            table : 'compute_servers'
            cb    : (err, synctable) =>
                @compute_servers = synctable
                cb(err)

    dbg: (method) =>
        return (m) => winston.debug("ComputeServerClient.#{method}: #{m}")

    ###
    Get info about server and add to database

        require 'c'; compute_server()
        s.add_server(host:'compute8-us', cb:done())
        s.add_server(host:'compute8-us', cb:done(), experimental:true)
        s.add_server(host:os.hostname(), cb:done())
    ###
    add_server: (opts) =>
        opts = defaults opts,
            host         : required
            dc           : ''        # deduced from hostname (everything after -) if not given
            experimental : false     # if true, don't allocate new projects here
            member_host  : false     # if true, only for members-only projects
            timeout      : 30
            cb           : required
        dbg = @dbg("add_server(#{opts.host})")
        dbg("adding compute server to the database by grabbing conf files, etc.")
        if @_single or @_kubernetes
            dbg("single machine server -- just copy files directly")
            @_add_server_single(opts)
            return

        if not opts.dc
            i = opts.host.indexOf('-')
            if i != -1
                opts.dc = opts.host.slice(0,i)

        get_file = (path, cb) =>
            dbg("get_file: #{path}")
            misc_node.execute_code
                command : "ssh"
                path    : process.cwd()
                timeout : opts.timeout
                args    : ['-o', 'StrictHostKeyChecking=no', opts.host, "cat #{path}"]
                verbose : 0
                cb      : (err, output) =>
                    if err
                        cb(err)
                    else if output?.stderr and output.stderr.indexOf('No such file or directory') != -1
                        cb(output.stderr)
                    else
                        cb(undefined, output.stdout)

        port = undefined; secret = undefined
        {program} = require('smc-hub/compute-server')
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        get_file program.port_file, (err, x) =>
                            port = parseInt(x); cb(err)
                    (cb) =>
                        get_file program.secret_file, (err, x) =>
                            secret = x; cb(err)
                ], cb)
            (cb) =>
                dbg("update database")
                @database.save_compute_server
                    host         : opts.host
                    dc           : opts.dc
                    port         : port
                    secret       : secret
                    experimental : opts.experimental
                    member_host  : opts.member_host
                    cb           : cb
        ], opts.cb)

    _add_server_single: (opts) =>
        opts = defaults opts,
            timeout : 30
            cb      : required
        dbg = @dbg("_add_server_single")
        dbg("adding the compute server to the database by grabbing conf files, etc.")
        port = secret = undefined
        {program} = require('smc-hub/compute-server')
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        fs.readFile program.port_file, (err, x) =>
                            if x?
                                port = parseInt(x.toString())
                            cb(err)
                    (cb) =>
                        fs.readFile program.secret_file, (err, x) =>
                            if x?
                                secret = x.toString().trim()
                            cb(err)
                ], cb)
            (cb) =>
                dbg("update database")
                @database.save_compute_server
                    host         : 'localhost'
                    dc           : ''
                    port         : port
                    secret       : secret
                    experimental : false
                    member_host  : false
                    cb           : cb
        ], opts.cb)


    # Choose a host from the available compute_servers according to some
    # notion of load balancing (not really worked out yet)
    assign_host: (opts) =>
        opts = defaults opts,
            exclude     : []
            member_host : undefined   # if true, put project on a member host; if false, don't put on a member host - ignore if not defined
            cb          : required
        ##opts.cb(undefined, 'compute20'); return   # FOR TESTING!!!! -- would force to open there
        dbg = @dbg("assign_host")
        dbg("querying database")
        @status
            cb : (err, nodes) =>
                if err
                    opts.cb(err)
                else
                    # Ignore any exclude nodes
                    for host in opts.exclude
                        delete nodes[host]
                    # We want to choose the best (="least loaded?") working node.
                    v = []
                    for host, info of nodes
                        if EXPERIMENTAL
                            # only use experimental nodes
                            if not info.experimental
                                continue
                        else
                            # definitely don't assign experimental nodes
                            if info.experimental
                                continue
                        if opts.member_host? and (opts.member_host != !!info.member_host)
                            # host is member but project isn't (or vice versa)
                            continue
                        v.push(info)
                        info.host = host
                        if info.error?
                            info.score = 0
                        else
                            # 10 points if no load; 0 points if massive load
                            load = info.load?[0] ? 1   # 1 if not defined
                            info.score = Math.max(0, Math.round(10*(1 - load)))
                            # 1 point for each Gigabyte of available RAM that won't
                            # result in swapping if used
                            mem = info.memory?.MemAvailable ? 1000   # 1GB if not defined
                            mem /= 1000
                            info.score += Math.round(mem)
                    if v.length == 0
                        opts.cb("no hosts available")
                        return
                    # sort so highest scoring is first.
                    v.sort (a,b) =>
                        if a.score < b.score
                            return 1
                        else if a.score > b.score
                            return -1
                        else
                            return 0
                    dbg("scored host info = #{misc.to_json(([info.host,info.score] for info in v))}")
                    # finally choose one of the hosts with the highest score at random.
                    ###
                    best_score = v[0].score
                    i = 0
                    while i < v.length and v[i].score == best_score
                        i += 1
                    v = v.slice(0,i)
                    ###

                    # I'm disabling this, since in practice random is probably
                    # better than the very naive approach above, given that we sometimes
                    # have 100+ projects created at once, and they all end up in the same place!
                    opts.cb(undefined, misc.random_choice(v).host)

    remove_from_cache: (opts) =>
        opts = defaults opts,
            host : required
        winston.debug("remove_from_cache(host=#{opts.host})")
        if @_socket_cache?
            delete @_socket_cache[opts.host]

    # get a socket connection to a particular compute server
    socket: (opts) =>
        opts = defaults opts,
            host : required
            cb   : required
        if not @_socket_cache?
            @_socket_cache = {}
        socket = @_socket_cache[opts.host]
        if socket?
            opts.cb(undefined, socket)
            return
        # IMPORTANT: in case socket gets called many times at once with the same host as input,
        # we must only get a socket once, then return it to all the callers.
        if not @_socket_cbs?
            @_socket_cbs = {}
        if not @_socket_cbs[opts.host]?
            @_socket_cbs[opts.host] = [opts.cb]
            @_get_socket opts.host, (err, socket) =>
                if socket?
                    # Cache the socket we just got
                    @_socket_cache[opts.host] = socket
                # Get list of callbacks to notify
                v = @_socket_cbs[opts.host]
                delete @_socket_cbs[opts.host]  # don't notify again
                # Notify callbacks
                for cb in v
                    cb(err, socket)
        else
            @_socket_cbs[opts.host].push(opts.cb)

    # the following is used internally by @socket to actually get a socket, but with no
    # checking or caching.
    _get_socket: (host, cb) =>
        dbg = @dbg("socket(#{host})")
        if @_dev
            dbg("development mode 'socket'")
            require('./compute-server').fake_dev_socket (err, socket) =>
                if err
                    cb(err)
                else
                    @_socket_cache[host] = socket
                    socket.on 'mesg', (type, mesg) =>
                        if type == 'json'
                            if mesg.event == 'project_state_update'
                                winston.debug("state_update #{misc.to_safe_str(mesg)}")
                                @database.set_project_state
                                    project_id : mesg.project_id
                                    state      : mesg.state
                                    time       : mesg.time
                                    error      : mesg.state_error
                                    cb         : (err) =>
                                        if err
                                            winston.debug("Error setting state of #{mesg.project_id} in database -- #{err}")
                    cb(undefined, socket)
            return

        info = undefined
        socket = undefined
        async.series([
            (cb) =>
                dbg("getting port and secret (host='#{host}')...")
                @database.get_compute_server
                    host : host
                    cb   : (err, x) =>
                        info = x; cb(err)
            (cb) =>
                if not info?
                    err = "no information about host='#{host}' in database"
                    dbg(err)
                    cb(err)
                    return
                dbg("connecting to #{host}:#{info.port}...")
                misc_node.connect_to_locked_socket
                    host    : host
                    port    : info.port
                    token   : info.secret
                    timeout : 15
                    cb      : (err, _socket) =>
                        if err
                            dbg("failed to connect: #{err}")
                            cb(err)
                        else
                            socket = _socket
                            misc_node.enable_mesg(socket)
                            socket.id = uuid.v4()
                            dbg("successfully connected -- socket #{socket.id}")
                            socket.on 'end', () =>
                                dbg("socket #{socket.id} ended")
                                for _, p of @_project_cache
                                    if p._socket_id == socket.id
                                        delete p._socket_id
                                if @_socket_cache[host]?.id == socket.id
                                    delete @_socket_cache[host]
                                socket.removeAllListeners()
                            socket.on 'mesg', (type, mesg) =>
                                if type == 'json'
                                    if mesg.event == 'project_state_update'
                                        winston.debug("state_update #{misc.to_safe_str(mesg)}")
                                        @database.set_project_state
                                            project_id : mesg.project_id
                                            state      : mesg.state
                                            time       : mesg.time
                                            error      : mesg.state_error
                                            cb         : (err) =>
                                                if err
                                                    winston.debug("Error setting state of #{mesg.project_id} in database -- #{err}")
                                    else
                                        winston.debug("mesg (hub <- #{host}): #{misc.to_safe_str(mesg)}")
                            cb()
        ], (err) =>
            cb(err, socket)
        )

    ###
    Send message to a server and get back result:

    x={};require('smc-hub/compute-client').compute_server(keyspace:'devel',cb:(e,s)->console.log(e);x.s=s;x.s.call(host:'localhost',mesg:{event:'ping'},cb:console.log))
    ###
    call: (opts) =>
        opts = defaults opts,
            host    : required
            mesg    : undefined
            timeout : 15
            project : undefined
            cb      : required
        dbg = @dbg("call(hub --> #{opts.host})")
        if DEVEL
            dbg("(hub --> compute) #{misc.to_json(opts.mesg)}")
        #dbg("(hub --> compute) #{misc.to_safe_str(opts.mesg)}")
        socket = undefined
        resp = undefined
        if not opts.mesg.id?
            opts.mesg.id = uuid.v4()
        async.series([
            (cb) =>
                dbg('getting socket')
                @socket
                    host : opts.host
                    cb   : (err, s) =>
                        dbg("got socket #{err}")
                        socket = s; cb(err)
            (cb) =>
                dbg("sending mesg")
                if opts.project?
                    # record that this socket was used by the given project
                    # (so on close can invalidate info)
                    opts.project._socket_id = socket.id
                socket.write_mesg 'json', opts.mesg, (err) =>
                    if err
                        e = "error writing to socket -- #{err}"
                        dbg(e)
                        cb(e)
                    else
                        dbg("waiting to receive response with id #{opts.mesg.id}")
                        start_time = new Date()
                        socket.recv_mesg
                            type    : 'json'
                            id      : opts.mesg.id
                            timeout : opts.timeout
                            cb      : (mesg) =>
                                dbg("got response -- #{misc.to_safe_str(mesg)}")
                                if mesg.event == 'error'
                                    dbg("error = #{mesg.error}")
                                    if new Date() - start_time >= Math.max(opts.timeout/1.1, 3000)
                                        # very likely a timeout error, so don't re-use this socket (this is dangerous though since we can accumulate sockets and DOS the compute server!)
                                        dbg("deleting socket cache for '#{opts.host}'")
                                        delete @_socket_cache[opts.host]
                                    cb(mesg.error)
                                else
                                    delete mesg.id
                                    resp = mesg
                                    dbg("success: resp=#{misc.to_safe_str(resp)}")
                                    cb()
        ], (err) =>
            opts.cb(err, resp)
        )

    ###
    Get a project:
        x={};require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);x.s=s;x.s.project(project_id:'20257d4e-387c-4b94-a987-5d89a3149a00',cb:(e,p)->console.log(e);x.p=p))
    ###
    project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        p = @_project_cache[opts.project_id]
        if p?
            opts.cb(undefined, p)
        else
            # This v is so that if project is called again before the first
            # call returns, then both calls get the same project back.
            v = @_project_cache_cb[opts.project_id]
            if v?
                v.push(opts.cb)
                return
            v = @_project_cache_cb[opts.project_id] = [opts.cb]
            new ProjectClient
                project_id     : opts.project_id
                compute_server : @
                cb             : (err, project) =>
                    delete @_project_cache_cb[opts.project_id]
                    if not err
                        @_project_cache[opts.project_id] = project
                    for cb in v
                        if err
                            cb(err)
                        else
                            cb(undefined, project)

    # get status information about compute servers
    status: (opts) =>
        opts = defaults opts,
            hosts          : undefined   # list of hosts or undefined=all compute servers
            timeout        : SERVER_STATUS_TIMEOUT_S  # compute server must respond this quickly or {error:some sort of timeout error..}
            min_interval_s : 60   # don't connect to compute servers and update their status more frequently than this.
            cb             : required    # cb(err, {host1:status, host2:status2, ...})
        dbg = @dbg('status')
        if @_dev
            opts.hosts = ['localhost']
        result = {}
        if opts.hosts?
            for host in opts.hosts
                result[host] = {}   # may get updated below based on db query

        cutoff = misc.seconds_ago(opts.min_interval_s)  # only query server if at least 1 minute has elapsed since last status query

        dbg("getting list of all compute server hostnames from database")
        @compute_servers.get().map (server, k) =>
            x = server.toJS()
            if not opts.hosts? or x.host in opts.hosts
                result[x.host] =
                    experimental : x.experimental
                    member_host  : x.member_host
                if (x.status?.timestamp ? 0) >= cutoff
                    for k, v of x.status
                        result[x.host][k] = v
        dbg("considering #{misc.len(result)} compute servers")
        dbg("querying servers #{misc.to_json(misc.keys(result))} for their status")
        f = (host, cb) =>
            if result[host].timestamp?
                # we copied the data in above -- nothing to update
                cb()
                return
            @call
                host    : host
                mesg    : message.compute_server_status()
                timeout : opts.timeout
                cb      : (err, resp) =>
                    if err
                        result[host].error = err
                    else
                        if not resp?.status
                            status = {error:"invalid response -- no status"}
                        else
                            status = resp.status
                        status.timestamp = new Date()
                        for k, v of status
                            result[host][k] = v
                        # also, set in the database (don't wait on this or require success)
                        @database.set_compute_server_status
                            host   : host
                            status : resp.status
                    cb()
        async.map(misc.keys(result), f, (err) => opts.cb(err, result))

    # WARNING: vacate_compute_server is **UNTESTED**
    vacate_compute_server: (opts) =>
        opts = defaults opts,
            compute_server : required    # array
            move           : false
            targets        : undefined  # array
            cb             : required
        @database.get_projects_on_compute_server
            compute_server : opts.compute_server
            columns        : ['project_id']
            cb             : (err, results) =>
                if err
                    opts.cb(err)
                else
                    winston.debug("got them; now processing...")
                    v = (x.project_id for x in results)
                    winston.debug("found #{v.length} on #{opts.compute_server}")
                    i = 0
                    f = (project_id, cb) =>
                        winston.debug("moving #{project_id} off of #{opts.compute_server}")
                        if opts.move
                            @project
                                project_id : project_id
                                cb         : (err, project) =>
                                    if err
                                        cb(err)
                                    else
                                        if opts.targets?
                                            i = (i + 1)%opts.targets.length
                                        project.move
                                            target : opts.targets?[i]
                                            cb     : cb
                    async.mapLimit(v, 15, f, opts.cb)

    ###
    projects = require('misc').split(fs.readFileSync('/home/salvus/work/2015-amath/projects').toString())
    require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e); s.set_quotas(projects:projects, cores:4, cb:(e)->console.log("DONE",e)))
    ###
    set_quotas: (opts) =>
        opts = defaults opts,
            projects     : required    # array of project id's
            disk_quota   : undefined
            cores        : undefined
            memory       : undefined
            cpu_shares   : undefined
            network      : undefined
            mintime      : undefined  # in seconds
            cb           : required
        projects = opts.projects
        delete opts.projects
        cb = opts.cb
        delete opts.cb
        f = (project_id, cb) =>
            o = misc.copy(opts)
            o.cb = cb
            @project
                project_id : project_id
                cb         : (err, project) =>
                    project.set_quotas(o)
        async.mapLimit(projects, 10, f, cb)

    ###
    projects = require('misc').split(fs.readFileSync('/home/salvus/tmp/projects').toString())
    require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e); s.move(projects:projects, target:'compute5-us', cb:(e)->console.log("DONE",e)))

    s.move(projects:projects, target:'compute4-us', cb:(e)->console.log("DONE",e))
    ###
    move: (opts) =>
        opts = defaults opts,
            projects : required    # array of project id's
            target   : required
            limit    : 10
            cb       : required
        projects = opts.projects
        delete opts.projects
        cb = opts.cb
        delete opts.cb
        f = (project_id, cb) =>
            @project
                project_id : project_id
                cb         : (err, project) =>
                    project.move(target: opts.target, cb:cb)
        async.mapLimit(projects, opts.limit, f, cb)

    # x={};require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);x.s=s;x.s.tar_backup_recent(max_age_h:1, cb:(e)->console.log("DONE",e)))
    tar_backup_recent: (opts) =>
        opts = defaults opts,
            max_age_h : required
            limit     : 1            # number to backup in parallel
            gap_s     : 5            # wait this long between backing up each project
            cb        : required
        dbg = @dbg("tar_backup_recent")
        target = undefined
        async.series([
            (cb) =>
                @database.recently_modified_projects
                    max_age_s : opts.max_age_h*60*60
                    cb        : (err, results) =>
                        if err
                            cb(err)
                        else
                            dbg("got #{results.length} projects modified in the last #{opts.max_age_h} hours")
                            target = results
                            cb()

            (cb) =>
                i = 0
                n = misc.len(target)
                winston.debug("next backing up resulting #{n} targets")
                running = {}
                f = (project_id, cb) =>
                  fs.exists "/projects/#{project_id}", (exists) =>
                    if not exists
                       winston.debug("skipping #{project_id} since not here")
                       cb(); return
                    j = i + 1
                    i += 1
                    running[j] = project_id
                    winston.debug("*****************************************************")
                    winston.debug("** #{j}/#{n}: #{project_id}")
                    winston.debug("RUNNING=#{misc.to_json(misc.keys(running))}")
                    winston.debug("*****************************************************")

                    smc_compute
                        args : ['tar_backup', project_id]
                        cb   : (err) =>
                            delete running[j]
                            winston.debug("*****************************************************")
                            winston.debug("** #{j}/#{n}: DONE -- #{project_id}, DONE")
                            winston.debug("RUNNING=#{misc.to_json(running)}")
                            winston.debug("*****************************************************")
                            winston.debug("result of backing up #{project_id}: #{err}")
                            if err
                                cb(err)
                            else
                                winston.debug("Now waiting #{opts.gap_s} seconds...")
                                setTimeout(cb, opts.gap_s*1000)
                async.mapLimit(target, opts.limit, f, cb)
        ], opts.cb)

    # Query database for all projects that are opened (so deployed on a compute VM), but
    # have not been touched in at least the given number of days.  For each such project,
    # stop it, save it, and close it (deleting files off compute server).  This should be
    # run periodically as a maintenance operation to free up disk space on compute servers.
    #   require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);global.s=s)
    #   s.close_open_unused_projects(dry_run:false, min_age_days:120, max_age_days:180, threads:5, host:'compute0-us', cb:(e,x)->console.log("TOTALLY DONE!!!",e))
    close_open_unused_projects: (opts) =>
        opts = defaults opts,
            min_age_days : required
            max_age_days : required
            host         : required    # server on which to close unused projects
            threads      : 1           # number to close in parallel
            dry_run      : false       # if true, just explain what would get deleted, but don't actually do anything.
            limit        : undefined   # if given, do this many of the closes, then just stop (use to test before going full on)
            cb           : required
        dbg = @dbg("close_open_unused_projects")
        target = undefined
        async.series([
            (cb) =>
                @database.get_open_unused_projects
                    min_age_days : opts.min_age_days
                    max_age_days : opts.max_age_days
                    host         : opts.host
                    cb           : (err, results) =>
                        if err
                            cb(err)
                        else
                            dbg("got #{results.length} open projects that were not used in the last #{opts.min_age_days} days")
                            target = results
                            cb()
            (cb) =>
                n = misc.len(target)
                winston.debug("There are #{n} projects to save and close.")
                if opts.limit
                    target = target.slice(0, opts.limit)
                    n = misc.len(target)
                    winston.debug("Reducing to only #{n} of them due to limit=#{opts.limit} parameter.")
                if opts.dry_run
                    cb()
                    return
                i = 0
                done = 0
                winston.debug("next saving and closing #{n} projects")
                running = {}
                f = (project_id, cb) =>
                    j = i + 1
                    i += 1
                    running[j] = project_id
                    winston.debug("*****************************************************")
                    winston.debug("** #{j}/#{n}: #{project_id}")
                    winston.debug("RUNNING=#{misc.to_json(misc.keys(running))}")
                    winston.debug("*****************************************************")
                    @project
                        project_id : project_id
                        cb         : (err, project) =>
                            if err
                                winston.debug("ERROR!!! #{err}")
                                cb(err)
                            else
                                state = undefined
                                async.series([
                                    (cb) =>
                                        # see if project is really not closed
                                        project.state
                                            cb : (err, s) =>
                                                if err
                                                    err = "error computing state -- #{err}"
                                                    cb(err)
                                                else
                                                    state = s?.state
                                                    cb()
                                    (cb) =>
                                        if state == 'closed'
                                            cb(); return
                                        project.close
                                            cb: cb
                                ], (err) =>
                                    project.free()
                                    delete running[j]
                                    done += 1
                                    winston.debug("*****************************************************")
                                    winston.debug("FINISHED #{done} of #{n}")
                                    winston.debug("** #{j}/#{n}: DONE -- #{project_id}, DONE")
                                    winston.debug("RUNNING=#{misc.to_json(running)}")
                                    winston.debug("*****************************************************")
                                    winston.debug("result of closing #{project_id}: #{err}")
                                    cb(err)
                                )
                async.mapLimit(target, opts.threads, f, cb)
        ], opts.cb)

    # Set all quotas of *all* projects on the given host.
    # Do this periodically as part of general maintenance in case something slips through the cracks.
    set_all_quotas: (opts) =>
        opts = defaults opts,
            host  : required
            limit : 1   # number to do at once
            cb    : undefined
        dbg = @dbg("set_all_quotas")
        dbg("host=#{opts.host}, limit=#{opts.limit}")
        projects = undefined
        async.series([
            (cb) =>
                dbg("get all the projects on this server")
                @database.get_projects_on_compute_server
                    compute_server : opts.host
                    cb             : (err, x) =>
                        projects = x
                        cb(err)
            (cb) =>
                dbg("call set_all_quotas on each project")
                n = 0
                f = (project, cb) =>
                    n += 1
                    dbg("#{n}/#{projects.length}")
                    @project
                        project_id : project.project_id
                        cb         : (err, p) =>
                            if err
                                cb(err)
                            else
                                p.set_all_quotas(cb: cb)
                async.mapLimit(projects, opts.limit, f, cb)
            ])

# This Projectclient has no garbage collection/way to free itself.
# Once a project is created, it just sits there with a changefeed,
# etc.  Never freed.  Not sure what to do...
class ProjectClient extends EventEmitter
    constructor: (opts) ->
        super()
        opts = defaults opts,
            project_id     : required
            compute_server : required
            cb             : required
        @project_id     = opts.project_id
        @compute_server = opts.compute_server
        @_dev           = @compute_server._dev
        @_single        = @compute_server._single
        @_kubernetes        = @compute_server._kubernetes

        dbg = @dbg('constructor')
        dbg()
        # initialize tables and force a state update
        async.series [@_init_synctable, @_init_storage_server], (err) =>
            dbg("initialized ProjectClient")
            opts.cb(err, @)

    # free -- stop listening for status updates from the database and broadcasting
    # updates about this project.
    # NOTE: as of writing this line, this free is never called by hub, and idle_timeout_s
    # is used instead below (of course, free could be used by maintenance operations).
    free: () =>
        # Ensure that next time this project gets requested, a fresh one is created, rather than
        # this cached one, which has been free'd up, and will no longer work.
        delete @compute_server._project_cache[@project_id]
        # Close the changefeed, so get no further data from database.
        @_synctable.close()
        # Make sure nothing else reacts to changes on this ProjectClient, since they won't happen.
        @removeAllListeners()

    _init_synctable: (cb) =>
        dbg = @dbg('_init_synctable')
        dbg()
        # don't want stale data:
        @host = @assigned = @_state = @_state_time =  @_state_error = undefined
        @_stale = true
        db = @compute_server.database
        # It's *critical* that idle_timeout_s be used below, since I haven't
        # come up with any good way to "garbage collect" ProjectClient objects,
        # due to the async complexity of everything.
        # ** TODO: IMPORTANT - idle_timeout_s is NOT IMPLEMENTED in postgres-synctable yet! **
        db.synctable
            idle_timeout_s : 60*10    # 10 minutes -- should be long enough for any single operation;
                                      # but short enough that connections get freed up.
            table          : 'projects'
            columns        : ['project_id', 'host', 'state', 'storage', 'storage_request']
            where          : {"project_id = $::UUID" : @project_id}
            where_function : (project_id) =>
                return project_id == @project_id  # fast easy test for matching
            cb             : (err, x) =>
                if err
                    dbg("error initializing synctable -- #{err}")
                    cb(err)
                else
                    dbg("initialized synctable successfully")
                    @_stale = false
                    @_synctable = x
                    update = () =>
                        new_val       = @_synctable.get(@project_id)?.toJS()
                        if not new_val?
                            # The project hasn't been created/written to the database yet, in which
                            # case there is nothing to do.  It should get added in a moment and
                            # trigger another update.
                            return
                        old_host      = @host
                        @host         = new_val.host?.host
                        @assigned     = new_val.host?.assigned
                        @_state       = new_val.state?.state
                        @_state_time  = new_val.state?.time
                        @_state_error = new_val.state?.error
                        @emit(@_state, @)
                        if STATES[@_state]?.stable
                            @emit('stable', @_state)
                        if old_host? and @host != old_host
                            @emit('host_changed', @host)  # event whenever host changes from one set value to another (e.g., move or failover)
                    update()
                    @_synctable.on('change', update)
                    cb()

    # ensure project has a storage server assigned to it (if there are any)
    _init_storage_server: (cb) =>
        dbg = @dbg('_init_storage_server')
        @_synctable.connect
            cb : (err) =>
                if err
                    cb(err)
                    return
                if @_synctable.getIn([@project_id, 'storage', 'host'])
                    dbg('already done')
                    cb()
                    return
                # assign a storage server, if there are any
                hosts = @compute_server.storage_servers.get()?.keySeq().toJS() ? []
                if hosts.length == 0
                    dbg('no storage servers')
                    cb()
                    return
                # TODO: use some size-balancing algorithm here!
                host = misc.random_choice(hosts)
                dbg("assigning storage server '#{host}'")
                @compute_server.database.set_project_storage
                    project_id : @project_id
                    host       : host
                    cb         : cb

    dbg: (method) =>
        (m) => winston.debug("ProjectClient(project_id='#{@project_id}','#{@host}').#{method}: #{m}")

    # Choose a compute server on which to place this project.  If project already assigned a host
    # and the host exists, just returns that.  This doesn't actually set the host assignment in
    # the database.
    get_host: (opts) =>
        opts = defaults opts,
            cb : required      # (err, hostname of compute server)
        host        = @host
        member_host = undefined
        dbg = @dbg("get_host")
        t = misc.mswalltime()
        if host
            # The host might no longer be defined at all, so we should check this here.
            if not @compute_server.compute_servers.get(host)?
                host = undefined
        async.series([
            (cb) =>
                if host
                    cb()
                else
                    @get_quotas
                        cb : (err, quota) =>
                            member_host = !!quota?.member_host
                            cb(err)
            (cb) =>
                if host
                    cb()
                else
                    dbg("assigning some host (member_host=#{member_host})")
                    @compute_server.assign_host
                        member_host : member_host
                        cb : (err, h) =>
                            if err
                                dbg("error assigning random host -- #{err}")
                                cb(err)
                            else
                                host = h
                                cb()
        ], (err) =>
            opts.cb?(err, host)
        )

    _action: (opts) =>
        opts = defaults opts,
            action  : required
            args    : undefined
            timeout : 30
            cb      : required
        dbg = @dbg("_action(action=#{opts.action})")
        if not @host
            opts.cb('project must be open before doing this action - no known host')
            return
        dbg("args=#{misc.to_safe_str(opts.args)}")

        if opts.action == 'start'
            try
                await site_license_hook(@compute_server.database, @project_id)
            catch err
                # ignore - don't not start the project just because
                # of a database issue/bug...
                dbg("ERROR in site license hook #{err}")

        dbg("calling compute server at '#{@host}'")
        @compute_server.call
            host    : @host
            project : @
            mesg    :
                message.compute
                    project_id : @project_id
                    action     : opts.action
                    args       : opts.args
            timeout : opts.timeout
            cb      : (err, resp) =>
                if err
                    dbg("error calling compute server -- #{err}")
                    # CRITICAL: For heavily loaded systems, an error as above can happen a lot.
                    # The server will get removed when the connection itself closes.
                    # So do not remove from cache except in some cases (not for every
                    # possible err message).  Removing from the cache willy nilly in all cases
                    # results in a huge number of connections from the hub to compute
                    # servers, which crashes everything.
                    if "#{err}".indexOf('error writing to socket') != -1
                        # See https://github.com/sagemathinc/cocalc/issues/507
                        # Experience suggests that when we get this error, it gets stuck like this
                        # and never goes away -- in this case we want to try again with a new connection.
                        @compute_server.remove_from_cache(host:@host)
                    opts.cb(err)
                else
                    dbg("got response #{misc.to_safe_str(resp)}")
                    if resp.error?
                        opts.cb(resp.error)
                    else
                        opts.cb(undefined, resp)

    _set_state: (opts) =>
        opts.project_id = @project_id
        @compute_server.database.set_project_state(opts)

    ###
    id='20257d4e-387c-4b94-a987-5d89a3149a00'; require('smc-hub/compute-client').compute_server(cb:(e,s)->console.log(e);global.s=s;s.project(project_id:id, cb:(e,p)->console.log(e);global.p=p; p.state(cb:console.log)))
    ###

    state: (opts) =>
        opts = defaults opts,
            force  : false
            update : false
            cb     : required     # cb(err, {state:?, time:?, error:?})
        dbg = @dbg("state()")
        if @_stale
            opts.cb("not connected to database")
            return
        state_obj = =>
            return {state : @_state, time : @_state_time, error : @_state_error}

        if not @host
            if @_dev or @_single or @_kubernetes
                # in case of dev or single or kubernetes mode, open will properly setup the host (which is just localhost)
                the_state = undefined
                async.series([
                    (cb) =>
                        @open(cb:cb)
                    (cb) =>
                        if not @host
                            cb("BUG: host not defined after open")
                            return
                        # open succeeded; now call state
                        @state
                            force : opts.force
                            cb    : (err, state) =>
                                the_state = state
                                cb(err)
                ], (err) =>
                    opts.cb(err, the_state)
                )
                return

            # Full multi-machine deployment: project definitely not open on any host
            if @_state != 'closed'
                dbg("project not opened, but state in db not closed -- set to closed")
                now = new Date()
                @_set_state
                    state      : 'closed'
                    time       : now
                    cb         : (err) =>
                        if err
                            opts.cb(err)
                        else
                            opts.cb(undefined, {state:'closed', time:now})
            else
                # state object is valid
                opts.cb(undefined, state_obj())
            return

        STATE_UPDATE_INTERVAL_S = 30  # always update db after this many seconds, no matter what
        if opts.force or not @_state_time? or new Date() - (@_last_state_update ? 0) >= 1000*STATE_UPDATE_INTERVAL_S
            dbg("calling remote compute server for state")
            @_action
                action  : "state"
                args    : if opts.update then ['--update']
                timeout : 60
                cb      : (err, resp) =>
                    @_last_state_update = new Date()
                    if err
                        dbg("problem getting state -- #{err}")
                        opts.cb(err)
                    else
                        dbg("got '#{misc.to_json(resp)}'")
                        if @_state != resp.state or @_state_error != resp.state_error or (resp.time - @_state_time >= 1000*STATE_UPDATE_INTERVAL_S)
                            # Set the latest info about state that we got in the database so that
                            # clients and other hubs know about it.
                            @_state = resp.state; @_state_time = resp.time; @_state_error = resp.state_error
                            @_set_state
                                state      : resp.state
                                time       : resp.time
                                error      : resp.state_error
                                cb         : (err) =>
                                    if err
                                        dbg("Error setting state of #{@project_id} in database -- #{err}")
                        opts.cb(undefined, state_obj())
        else
            opts.cb(undefined, state_obj())

    # information about project (ports, state, etc. )
    status: (opts) =>
        opts = defaults opts,
            cb     : required
        dbg = @dbg("status")
        dbg()
        status = undefined
        async.series([
            (cb) =>
                @_action
                    action : "status"
                    cb     : (err, s) =>
                        if not err
                            status = s
                        cb(err)
            (cb) =>
                dbg("get status from compute server")
                f = (cb) =>
                    @_action
                        action : "status"
                        cb     : (err, s) =>
                            if not err
                                status = s
                                # save status in database
                                @compute_server.database.set_project_status
                                    project_id : @project_id
                                    status     : status
                                    cb         : cb
                            else
                                cb(err)
                # we retry getting status with exponential backoff until we hit max_time, which
                # triggers failover of project to another node.
                misc.retry_until_success
                    f           : f
                    start_delay : 10000
                    max_time    : AUTOMATIC_FAILOVER_TIME_S*1000
                    cb          : (err) =>
                        if err
                            m = "failed to get status -- project not working on #{@host}"
                            dbg(m)
                            cb(m)
                            ## Auto failover disabled for now.
                            ## Now we actually initiate the failover, which could take a long time,
                            ## depending on how big the project is.
                            #@move
                            #    force : true
                            #    cb    : (err) =>
                            #        dbg("result of failover -- #{err}")
                        else
                            cb()
            (cb) =>
                @get_quotas
                    cb : (err, quotas) =>
                        if err
                            cb(err)
                        else
                            status.host = @host
                            status.ssh = @host
                            status.quotas = quotas
                            cb()
        ], (err) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, status)
        )


    # COMMANDS:

    # open project on some node.
    # A project is by definition opened on a host if @host is set.
    open: (opts) =>
        opts = defaults opts,
            host : undefined   # if given and project not on any host (so @host undefined), then this host will be used
            cb   : required
        @_synctable?.connect()
        if @host and @_state != 'closed'
            # already opened
            opts.cb()
            return
        dbg = @dbg("open")
        dbg()
        if @_dev or @_single or @_kubernetes
            host = 'localhost'
            async.series([
                (cb) =>
                    if not @host
                        @compute_server.database.set_project_host
                            project_id : @project_id
                            host       : host
                            cb         : cb
                    else
                        cb()
                (cb) =>
                    @_set_state
                        state : 'opened'
                        cb    : cb
            ], opts.cb)
            return

        host = undefined
        async.series([
            (cb) =>
                if opts.host
                    host = opts.host
                    cb()
                else
                    dbg("choose a host")
                    @get_host
                        cb : (err, h) =>
                            host = h
                            cb(err)
            (cb) =>
                dbg("unset project host")
                # important, so that we know when the project has been opened (see "wait until host set" below)
                @compute_server.database.unset_project_host
                    project_id : @project_id
                    cb         : cb
            (cb) =>
                dbg("request to open on '#{host}'")
                @_storage_request
                    action : 'open'
                    target : host
                    cb     : cb
            (cb) =>
                dbg("succeeded in opening; wait until host set")
                @_synctable.wait
                    until   : (table) => table.getIn([@project_id, 'host', 'host'])?
                    timeout : 30  # should be very fast
                    cb      : cb
            (cb) =>
                dbg('update state')
                @state
                    force  : true
                    update : true
                    cb     : cb
        ], (err) =>
            dbg("opening done -- #{err}")
            opts.cb(err)
        )


    # start project local_hub daemon running (must be opened somewhere)
    start: (opts) =>
        opts = defaults opts,
            set_quotas : true   # if true, also sets all quotas
            cb         : required
        dbg = @dbg("start")
        @_synctable?.connect()
        if @_state == 'running'
            dbg("already running")
            if opts.set_quotas
                @set_all_quotas(cb : opts.cb)
            else
                opts.cb()
            return
        if @_state == 'starting'
            dbg("wait until running")
            @wait_for_a_state
                states  : ['running']
                timeout : 30
                cb      : (err) =>
                    if err
                        opts.cb(err)
                    else if opts.set_quotas
                        @set_all_quotas(cb : opts.cb)
                    else
                        opts.cb()
            return
        locals =
            env: {}
        async.series([
            (cb) =>
                if opts.set_quotas
                    # CRITICAL: some quotas -- like member hosting must be set before project starts.
                    dbg("setting all quotas")
                    @set_all_quotas(cb:cb)
                else
                    cb()
            (cb) =>
                @open(cb : cb)
            (cb) =>
                @compute_server.database.get_project_extra_env
                    project_id : @project_id
                    cb         : (err, env) =>
                        if err
                            cb(err)
                        else
                            locals.env = Buffer.from(JSON.stringify(env)).toString('base64')
                            cb()
            (cb) =>
                dbg("issuing the start command")
                @_action
                    action : "start"
                    args   : ['--base_url', @compute_server._base_url, '--extra_env', locals.env]
                    cb     : cb
            (cb) =>
                dbg("waiting until running")
                @wait_for_a_state
                    states  : ['running']
                    timeout : 30
                    cb      : cb
            (cb) =>
                if opts.set_quotas and not @_kubernetes
                    # CRITICAL: for non-kubernetes the quotas **MUST** also be set after the project has started, since some of
                    # the quotas, e.g., disk space and network, can't be set until the Linux account
                    # has been created.   Kubernetes is of course the opposite...
                    dbg("setting all quotas")
                    @set_all_quotas(cb:cb)
                else
                    cb()
        ], (err) =>
            opts.cb(err)
        )

    # restart project -- must be opened or running
    restart: (opts) =>
        opts = defaults opts,
            set_quotas : true
            cb         : required
        @_synctable?.connect()
        dbg = @dbg("restart")
        dbg("get state")
        state = undefined
        async.series([
            (cb) =>
                @wait_stable_state
                    timeout : 30
                    cb : (err, s) =>
                        state = s; cb(err)
            (cb) =>
                if state != 'running'
                    dbg("just start it")
                    @start(cb: cb)
                else
                    dbg("stop it")
                    @stop
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                @start(cb:cb)
            (cb) =>
                if opts.set_quotas
                    dbg("setting all quotas")
                    @set_all_quotas(cb:cb)
                else
                    cb()
        ], opts.cb)

    # kill everything and remove project from this compute
    # node  (must be opened somewhere)
    close: (opts) =>
        opts = defaults opts,
            cb     : required
        @_synctable?.connect()
        args = []
        dbg = @dbg("close()")
        dbg()
        async.series([
            (cb) =>
                dbg("stop project from running")
                if @_state == 'running'
                    @stop(cb:cb)
                else
                    cb()
            (cb) =>
                dbg("doing storage request to close")
                @_storage_request
                    action : 'close'
                    cb     : cb
        ], opts.cb)

    ensure_opened_or_running: (opts) =>
        opts = defaults opts,
            cb : undefined  # cb(err, state='opened' or 'running')
        @_synctable?.connect()
        state = undefined
        dbg = @dbg("ensure_opened_or_running")
        async.series([
            (cb) =>
                dbg("get state")
                @wait_stable_state
                    cb : (err, s) =>
                        state = s; cb(err)
            (cb) =>
                if state == 'running' or state == 'opened'
                    cb()
                else if state == 'closed'
                    dbg("opening")
                    @open
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                dbg("it opened")
                                state = 'opened'
                                cb()
                else
                    cb("bug -- state='#{state}' should be stable but isn't known")
        ], (err) => opts.cb?(err, state))

    ensure_running: (opts) =>
        opts = defaults opts,
            cb : undefined
        @_synctable?.connect()
        state = undefined
        dbg = @dbg("ensure_running")
        async.series([
            (cb) =>
                @wait_stable_state
                    cb : (err, s) =>
                        state = s; cb(err)
            (cb) =>
                f = () =>
                    dbg("start running")
                    @start(cb : cb)
                if state == 'running'
                    cb()
                else if state == 'opened'
                    f()
                else if state == 'closed'
                    dbg("open first")
                    @open
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                dbg("project opened; now start running")
                                f()
                else
                    cb("bug -- state=#{state} should be stable but isn't known")
        ], (err) => opts.cb?(err))

    ensure_closed: (opts) =>
        opts = defaults opts,
            cb     : undefined
        @_synctable?.connect()
        dbg = @dbg("ensure_closed()")
        state = undefined
        async.series([
            (cb) =>
                @wait_stable_state
                    cb : (err, s) =>
                        state = s; cb(err)
            (cb) =>
                f = () =>
                    dbg("close project")
                    @close(cb : cb)
                if state == 'closed'
                    cb()
                else if state == 'opened'
                    f()
                else if state == 'running'
                    dbg("is running so first stop it")
                    @stop
                        cb : (err) =>
                            if err
                                cb(err)
                            else
                                f()
                else
                    cb("bug -- state=#{state} should be stable but isn't known")
        ], (err) => opts.cb?(err))

    # Determine whether or not a storage request is currently running for this project
    is_storage_request_running: () =>
        @_synctable?.connect()
        x = @_synctable.getIn([@project_id, 'storage_request'])
        if not x?
            return false
        x = x.toJS()
        if x.started? and not x.finished? and (new Date() - x.started) < 1000*60*30   # 30m=stale
            return true
        return false

    wait_storage_request_finish: (opts) =>
        opts = defaults opts,
            timeout : 60*30
            cb      : required
        winston.debug("wait_storage_request_finish")
        @_synctable.wait
            until   : (table) => table.getIn([@project_id, 'storage_request', 'finished'])?
            timeout : opts.timeout
            cb      : opts.cb

    wait_stable_state: (opts) =>
        opts = defaults opts,
            timeout : 60*10  # 10 minutes
            cb      : required
        dbg = (m) => winston.debug("wait_stable_state (state='#{@_synctable.getIn([@project_id, 'state', 'state'])}')': #{m}")
        dbg('causing state update')
        @state    # opportunity to cause state update
            force  : true
            update : true
            cb     : () =>
                dbg("waiting for state to change to something stable")
                @_synctable.wait
                    timeout : opts.timeout
                    cb      : opts.cb
                    until   : (table) =>
                        state = table.getIn([@project_id, 'state', 'state'])
                        if STATES[state]?.stable
                            dbg("synctable changed to stable state")
                            return state
                        else
                            dbg("synctable changed but state NOT stable yet; keep waiting...")
                            return false

    wait_for_a_state: (opts) =>
        opts = defaults opts,
            timeout : 60         # 1 minute
            states  : required
            cb      : required
        dbg = (m) => winston.debug("wait_for_a_state in #{misc.to_json(opts.states)}, state='#{@_synctable.getIn([@project_id, 'state', 'state'])}': #{m}")
        dbg("cause state update")
        if @_dev
            @_wait_for_a_state_dev(opts)
            return
        @state
            force : true
            cb    : =>
                    # Compute server will update synctable when change happens.
                    @_synctable.wait
                        timeout : opts.timeout
                        cb      : opts.cb
                        until   : (table) =>
                            state = table.getIn([@project_id, 'state', 'state'])
                            if state in opts.states
                                dbg("in the right state")
                                return state
                            else
                                dbg("wait longer...")

    _wait_for_a_state_dev: (opts) =>
        # For smc-in-smc dev, we have to **manually** cause another check,
        # since there is no separate compute server running!
        dbg = (m) => winston.debug("_wait_for_a_state(dev) in #{misc.to_json(opts.states)}, state='#{@_synctable.getIn([@project_id, 'state', 'state'])}': #{m}")
        dbg("retry until succeess")
        misc.retry_until_success
            max_time    : opts.timeout*1000
            start_delay : 250
            max_delay   : 3000
            f           : (cb) =>
                dbg("force update")
                @state
                    force  : true
                    update : true
                    cb     : =>
                        state = @_synctable.getIn([@project_id, 'state', 'state'])
                        if state in opts.states
                            dbg("in a required state")
                            opts.cb(undefined, state)
                            cb()
                        else
                            cb('keep trying')

    # Move project from one compute node to another one.  Both hosts are assumed to be working!
    # We will have to write something else to deal with auto-failover in case of a host not working.
    move: (opts) =>
        opts = defaults opts,
            target : undefined # hostname of a compute server; if not given, one (diff than current) will be chosen by load balancing
            force  : false     # ignored for now
            cb     : required
        @_synctable?.connect()
        dbg = @dbg("move(target:'#{opts.target}')")
        if opts.target? and @host == opts.target
            dbg("project is already at target -- not moving")
            opts.cb()
            return

        member_host = undefined
        async.series([
            (cb) =>
                if opts.target?
                    cb()
                else
                    dbg("determine member_host status of project")
                    @get_quotas
                        cb : (err, quota) =>
                            member_host = !!quota?.member_host
                            dbg("member_host=#{member_host}")
                            cb(err)
            (cb) =>
                dbg("determine target (member_host=#{member_host})")
                if opts.target?
                    cb()
                else
                    exclude = []
                    if @host
                        exclude.push(@host)
                    @compute_server.assign_host
                        exclude     : exclude
                        member_host : member_host
                        cb      : (err, host) =>
                            if err
                                cb(err)
                            else
                                dbg("assigned target = #{host}")
                                opts.target = host
                                cb()
            (cb) =>
                dbg("stop project from running so user doesn't lose work during transfer and processes aren't left around")
                if @_state == 'running'
                    @stop
                        cb : (err) =>
                            # ignore error on purpose
                            cb()
                else
                    cb()
            (cb) =>
                dbg("doing storage request")
                @_storage_request
                    action : 'move'
                    target : opts.target
                    cb     : cb
            (cb) =>
                dbg("project now opened on target")
                @_set_state
                    state : 'opened'
                    cb    : cb
        ], opts.cb)

    stop: (opts) =>
        opts = defaults opts,
            cb     : required
        @_synctable?.connect()
        @dbg("stop")("will kill all processes")
        async.series([
            (cb) =>
                @_action
                    action : "stop"
                    cb     : cb
            (cb) =>
                @wait_for_a_state
                    states : ['opened', 'closed']
                    cb     : cb
        ], opts.cb)

    _storage_request: (opts) =>
        opts = defaults opts,
            action : required
            target : undefined
            cb     : undefined
        m = "_storage_request(action='#{opts.action}'"
        m += if opts.target? then ",target='#{opts.target}')" else ")"
        dbg = @dbg(m)
        dbg("")
        if (@compute_server.storage_servers.get()?.size ? 0) == 0
            dbg('no storage servers -- so all _storage_requests trivially done')
            opts.cb?()
            return
        if @is_storage_request_running()
            opts.cb?("already doing a storage request")
            return

        final_state = fail_state = undefined
        async.series([
            (cb) =>
                @_synctable.connect(cb:cb)
            (cb) =>
                state = @_synctable.getIn([@project_id, 'state', 'state'])
                switch opts.action
                    when 'open'
                        action_state = 'opening'
                        final_state = 'opened'
                        fail_state  = 'closed'
                    when 'save'
                        action_state = 'saving'
                        final_state = state
                        fail_state  = state
                    when 'close'
                        action_state = 'closing'
                        final_state = 'closed'
                        fail_state  = 'opened'
                    else
                        final_state = fail_state = state
                if action_state?
                    dbg("set state to '#{action_state}'")
                    @_set_state
                        state : action_state
                        cb    : cb
                else
                    cb()
            (cb) =>
                dbg("update database with *request* to '#{misc.to_json(opts.action)}' -- this causes storage server to doing something")
                @compute_server.database.set_project_storage_request
                    project_id : @project_id
                    action     : opts.action
                    target     : opts.target
                    cb         : cb
            (cb) =>
                dbg("wait for action to finish")
                @wait_storage_request_finish
                    cb : (err) =>
                        if err
                            dbg("set state to fail state")
                            @_set_state
                                state      : fail_state
                                error      : err
                                cb         : cb
                        else
                            cb()
            (cb) =>
                dbg("set state to '#{final_state}'")
                @_set_state
                    state      : final_state
                    cb         : cb
        ], (err) =>
            opts.cb?(err)
        )

    save: (opts) =>
        opts = defaults opts,
            min_interval  : 5  # fail if already saved less than this many MINUTES (use 0 to disable) ago
            cb            : undefined
        if @_kubernetes or @_dev or @_single
            opts.cb() # save not needed in these modes
            return
        dbg = @dbg("save(min_interval:#{opts.min_interval})")
        dbg("")
        @_synctable.connect
            cb : (err) =>
                if err
                    opts.cb?(err)
                    return
                # update @_last_save with value from database (could have been saved by another compute server)
                s = @_synctable.getIn([@project_id, 'storage', 'saved'])
                if not @_last_save? or s > @_last_save
                    @_last_save = s

                # Do a client-side test to see if we have saved too recently
                if opts.min_interval and @_last_save and (new Date() - @_last_save) < 1000*60*opts.min_interval
                    dbg("already saved")
                    opts.cb?("already saved within min_interval")
                    return
                @_last_save = new Date()
                dbg('doing actual save')
                @_storage_request
                    action : 'save'
                    cb     : opts.cb

                # do this but don't block on returning.
                dbg("send message to storage server that project is being saved")
                # it will be marked as active  as a result (so it doesn't idle timeout)
                @_action
                    action : "save"
                    cb     : (err) =>
                        dbg("finished save message to backend: #{err}")

    _address: (cb) =>
        dbg = @dbg("_address")
        dbg("get project location and listening port -- will open and start project if necessary")
        address = undefined
        async.series([
            (cb) =>
                dbg("first ensure project is running")
                @ensure_running(cb:cb)
            (cb) =>
                @status
                    cb : (err, status) =>
                        if err
                            cb(err)
                        else
                            if status.state != 'running'
                                dbg("something went wrong and not running ?! -- status=#{misc.to_json(status)}")
                                cb("not running")  # DO NOT CHANGE -- exact callback error is used by client code in the UI
                            else
                                dbg("status includes info about address...")
                                if not @host or not status['local_hub.port'] or not status.secret_token
                                    cb("unknown host, port, or secret_token")
                                    return
                                address =
                                    host         : @host
                                    port         : status['local_hub.port']
                                    secret_token : status.secret_token
                                    ip           : status.ip
                                cb()
        ], (err) =>
            cb(err, address)
        )


    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address-2")
        dbg()
        @_synctable?.connect()
        @_address (err, address) =>
            if not address and not err
                err = "failed to get address"
            dbg(err)  # do not log the address since maybe it's a more complicated object with the secret token? TODO
            opts.cb(err, address)

    # The following "reuse in flight" version keeps hanging on cc-in-cc dev
    # and possibly on cocalc-docker (?), so I'm trying disabling it in favor
    # of the above.  I think it's just an optimization anyways.

    ###
    # This will keep trying for up to 5 minutes to get the address, with exponential
    # decay backing off up to 15s between attempts.
    # If/when it works, the returned address object will definitely have the
    # host, port and secret_token set.
    # In some cases it will also have the ip set, which should be
    # preferred to host.
    address: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("address")
        if @_address_cbs?
            @_address_cbs.push(opts.cb)
            dbg("address already running, so adding callback to queue; it now has length #{@_address_cbs.length}")
            return
        @_synctable?.connect()
        @_address_cbs = [opts.cb]
        dbg()
        address = undefined
        misc.retry_until_success
            f           : (cb) =>
                @_address (err, x) =>
                    address = x
                    cb(err)
            start_delay : 3000
            max_delay   : 15000
            max_time    : 5*60*1000
            cb          : (err) =>
                if not address and not err
                    err = "failed to get address"
                v = @_address_cbs
                delete @_address_cbs
                for cb in v
                    cb(err, address)
    ###

    copy_path: (opts) =>
        opts = defaults opts,
            path              : ""
            target_project_id : ""
            target_path       : ""        # path into project; if "", defaults to path above.
            overwrite_newer   : false     # if true, newer files in target are copied over (otherwise, uses rsync's --update)
            delete_missing    : false     # if true, delete files in dest path not in source, **including** newer files
            backup            : false     # make backup files
            exclude_history   : false
            timeout           : 5*60
            bwlimit           : undefined
            wait_until_done   : undefined # not used, only relevant for the kucalc variant
            scheduled         : undefined # --*--
            public            : false     # this is ignored here, since there is no special share server with copies of public files...
            cb                : required
        dbg = @dbg("copy_path(#{opts.path} to #{opts.target_project_id})")
        dbg("copy a path using rsync from one project to another")
        if not opts.target_project_id
            opts.target_project_id = @project_id
        if not opts.target_path
            opts.target_path = opts.path
        args = ["--path", opts.path,
                "--target_project_id", opts.target_project_id,
                "--target_path", opts.target_path]
        if opts.overwrite_newer
            args.push('--overwrite_newer')
        if opts.delete_missing
            args.push('--delete_missing')
        if opts.backup
            args.push('--backup')
        if opts.exclude_history
            args.push('--exclude_history')
        if opts.bwlimit
            args.push('--bwlimit')
            args.push(opts.bwlimit)
        dbg("created args=#{misc.to_safe_str(args)}")
        target_project = undefined
        async.series([
            (cb) =>
                if @_kubernetes or @_dev or @_single
                    cb() # project need not be running before copying in these modes
                    return
                @ensure_opened_or_running
                    cb : cb
            (cb) =>
                if opts.target_project_id == @project_id
                    cb()
                else
                    dbg("getting other project and ensuring that it is already opened")
                    @compute_server.project
                        project_id : opts.target_project_id
                        cb         : (err, x) =>
                            if err
                                dbg("error ")
                                cb(err)
                            else
                                target_project = x
                                if @_kubernetes or @_dev or @_single
                                    cb() # project need not be running before copying in these modes
                                    return
                                target_project.ensure_opened_or_running
                                    cb : (err) =>
                                        if err
                                            cb(err)
                                        else
                                            dbg("got other project on #{target_project.host}")
                                            args.push("--target_hostname")
                                            args.push(target_project.host)
                                            cb()
            (cb) =>
                containing_path = misc.path_split(opts.target_path).head
                if not containing_path
                    dbg("target path need not be made since is home dir")
                    cb(); return
                dbg("create containing target directory = #{containing_path}")
                if opts.target_project_id != @project_id
                    target_project._action
                        action  : 'mkdir'
                        args    : [containing_path]
                        timeout : opts.timeout
                        cb      : cb
                else
                    @_action
                        action  : 'mkdir'
                        args    : [containing_path]
                        timeout : opts.timeout
                        cb      : cb
            (cb) =>
                dbg("doing the actual copy")
                @_action
                    action  : 'copy_path'
                    args    : args
                    timeout : opts.timeout
                    cb      : cb
            (cb) =>
                if target_project?
                    dbg("target is another project, so saving that project (if possible)")
                    target_project.save
                        cb: (err) =>
                            if err
                                #  NON-fatal: this could happen, e.g, if already saving...  very slightly dangerous.
                                dbg("warning: can't save target project -- #{err}")
                            cb()
                else
                    cb()
        ], (err) =>
            if err
                dbg("error -- #{err}")
            opts.cb(err)
        )

    directory_listing: (opts) =>
        opts = defaults opts,
            path      : ''
            hidden    : false
            time      : false        # sort by timestamp, with newest first?
            start     : 0
            limit     : -1
            cb        : required
        dbg = @dbg("directory_listing")
        @ensure_opened_or_running
            cb : (err) =>
                if err
                    opts.cb(err)
                else
                    args = []
                    if opts.hidden
                        args.push("--hidden")
                    if opts.time
                        args.push("--time")
                    # prefix relative paths with ./ such that names starting with a dash do not confuse parsing arguments
                    args.push("--path")
                    if opts.path[0] isnt '/'
                        args.push("./#{opts.path}")
                    else
                        args.push(opts.path)
                    for k in ['start', 'limit']
                        args.push("--#{k}"); args.push(opts[k])
                    dbg("get listing of files using options #{misc.to_safe_str(args)}")
                    @_action
                        action : 'directory_listing'
                        args   : args
                        cb     : opts.cb

    read_file: (opts) =>
        opts = defaults opts,
            path    : required
            maxsize : 3000000    # maximum file size in bytes to read
            cb      : required   # cb(err, Buffer)
        dbg = @dbg("read_file(path:'#{opts.path}')")
        dbg("read a file or directory from disk")  # directories get zip'd
        @ensure_opened_or_running
            cb : (err) =>
                if err
                    opts.cb(err)
                else
                    @_action
                        action  : 'read_file'
                        args    : [opts.path, "--maxsize", opts.maxsize]
                        cb      : (err, resp) =>
                            if err
                                opts.cb(err)
                            else
                                opts.cb(undefined, Buffer.from(resp.base64, 'base64'))

    get_quotas: (opts) =>
        opts = defaults opts,
            cb           : required
        @dbg("get_quotas")("lookup project quotas in the database")
        @compute_server.database.get_project_quotas
            project_id : @project_id
            cb         : opts.cb

    # If member_host is true, make sure project is on a members only host, and if
    # member_host is false, make sure project is NOT on a members only host.
    # If project is not open on any host, don't do anything.  This function
    # never puts project on an experimental server.
    # This does *NOT* set anything in the database about this project being member_host'ed;
    # that's entirely determined by upgrades.
    set_member_host: (opts) =>
        opts = defaults opts,
            member_host : required
            cb          : required
        if @_kubernetes or @_dev or @_single or not @host
            # dev environments -- only one host.   Or, not open on any host.
            opts.cb()
            return
        # Ensure that member_host is a boolean for below; it is an integer -- 0 or >= 1 -- elsewhere.  But below
        # we very explicitly assume it is boolean (due to coffeescript not doing coercion).
        opts.member_host =  opts.member_host > 0
        dbg = @dbg("set_member_host(member_host=#{opts.member_host})")
        host_is_members_only = !!@compute_server.compute_servers.getIn([@host, 'member_host'])
        dbg("host_is_members_only = #{host_is_members_only}")
        if opts.member_host == host_is_members_only
            # done -- nothing to do
            opts.cb()
            return
        dbg("must move project, if possible")
        w = []
        @compute_server.compute_servers.get().map (server, host) =>
            if server.get('experimental')
                return
            if opts.member_host == !!server.get('member_host')
                w.push(host)
        if w.length == 0
            opts.cb("there are no #{if not opts.member_host then 'non-' else ''}members only hosts available")
            return
        target = misc.random_choice(w)
        dbg("moving project to #{target}...")
        @move
            target : target
            cb     : opts.cb

    set_quotas: (opts) =>
        # Ignore any quotas that aren't in the list below: these are the only ones that
        # the local compute server supports.   It is convenient to allow the caller to
        # pass in additional quota settings.
        opts = misc.copy_with(opts, ['disk_quota', 'cores', 'memory', 'cpu_shares', 'network', 'mintime', 'member_host', 'ephemeral_state', 'ephemeral_disk', 'cb'])
        dbg = @dbg("set_quotas")
        dbg("set various quotas")
        commands = undefined
        async.series([
            (cb) =>
                if not opts.member_host?
                    cb()
                else
                    dbg("ensure machine is or is not on member host")
                    @set_member_host
                        member_host : opts.member_host
                        cb          : cb
            (cb) =>
                dbg("get state")
                @state
                    cb: (err, s) =>
                        if err
                            cb(err)
                        else
                            dbg("state = #{s.state}")
                            commands = STATES[s.state].commands
                            cb()
            (cb) =>
                async.parallel([
                    (cb) =>
                        if opts.network? and commands.indexOf('network') != -1
                            dbg("update network: #{opts.network}")
                            @_action
                                action : 'network'
                                args   : if opts.network then [] else ['--ban']
                                cb     : cb
                        else
                            cb()
                    (cb) =>
                        if opts.mintime? and commands.indexOf('mintime') != -1
                            dbg("update mintime quota on project")
                            @_action
                                action : 'mintime'
                                args   : [opts.mintime]
                                cb     : (err) =>
                                    cb(err)
                        else
                            cb()
                    (cb) =>
                        if opts.disk_quota? and commands.indexOf('disk_quota') != -1
                            dbg("disk quota")
                            @_action
                                action : 'disk_quota'
                                args   : [opts.disk_quota]
                                cb     : cb
                        else
                            cb()
                    (cb) =>
                        if opts.ephemeral_state? and commands.indexOf('ephemeral_state') != -1
                            dbg("ephemeral_state")
                            @_action
                                action : 'ephemeral_state'
                                args   : [opts.ephemeral_state]
                                cb     : cb
                        else
                            cb()
                    (cb) =>
                        if opts.ephemeral_disk? and commands.indexOf('ephemeral_disk') != -1
                            dbg("ephemeral_disk")
                            @_action
                                action : 'ephemeral_disk'
                                args   : [opts.ephemeral_disk]
                                cb     : cb
                        else
                            cb()
                    (cb) =>
                        if (opts.cores? or opts.memory? or opts.cpu_shares?) and commands.indexOf('compute_quota') != -1
                            dbg("compute quota")
                            args = []
                            for s in ['cores', 'memory', 'cpu_shares']
                                if opts[s]?
                                    if s == 'cpu_shares'
                                        opts[s] = Math.floor(opts[s])
                                    args.push("--#{s}")
                                    args.push(opts[s])
                            @_action
                                action : 'compute_quota'
                                args   : args
                                cb     : cb
                        else
                            cb()
                ], cb)
        ], (err) =>
            dbg("done setting quotas -- #{err}")
            opts.cb(err)
        )

    set_all_quotas: (opts) =>
        opts = defaults opts,
            cb : required
        dbg = @dbg("set_all_quotas")
        quotas = undefined
        async.series([
            (cb) =>
                dbg("looking up quotas for this project from database")
                @get_quotas
                    cb : (err, x) =>
                        quotas = x; cb(err)
            (cb) =>
                dbg("setting the quotas to #{misc.to_json(quotas)}")
                quotas.cb = cb
                @set_quotas(quotas)
        ], (err) => opts.cb(err))
