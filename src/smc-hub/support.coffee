#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# Handling support tickets for users -- currently a Zendesk wrapper.
# (c) 2016, SageMath, Inc.
# License: GPLv3

###
Support Tickets, built on top of Zendesk's Core API

Docs:

https://developer.zendesk.com/rest_api/docs/core/introduction
https://github.com/blakmatrix/node-zendesk
###

# if true, no real tickets are created
DEBUG    = process.env.SMC_TEST_ZENDESK ? false
SMC_TEST = process.env.SMC_TEST

async   = require('async')
fs      = require('fs')
path    = require('path')
misc    = require('smc-util/misc')
theme   = require('smc-util/theme')
_       = require('underscore')
{defaults, required} = misc

winston      = require('./winston-metrics').get_logger('support')


zendesk_password_filename = ->
    return (process.env.SMC_ROOT ? '.') + '/data/secrets/zendesk'

fixSessions = (body) ->
    # takes the body of the ticket, searches for http[s]://<theme.DNS>/ URLs and either replaces ?session=* by ?session= or adds it
    body = body.replace(/\?session=([^\s]*)/g, '?session=')

    urlPattern = new RegExp("(http[s]?://[^\\s]*#{theme.DNS}[^\\s]+)", "g")
    reSession = /session=([^\s]*)/g

    ret = ''
    offset = 0

    while m = urlPattern.exec(body)
        url = m[0]
        i = m.index
        j = i + url.length
        #console.log(i, j)
        #console.log(x[i..j])

        ret += body[offset...i]

        q = url.indexOf('?session')
        if q >= 0
            url = url[0...q]
        q = url.indexOf('?')
        if q >= 0
            url += '&session='
        else
            url += '?session='
        ret += url
        offset = j
    ret += body[offset...body.length]
    return ret

support = undefined
exports.init_support = (cb) ->
    support = new Support cb: (err, s) =>
        support = s
        cb(err)

exports.get_support = ->
    return support

class Support
    constructor: (opts={}) ->
        opts = defaults opts,
            cb       : undefined

        @dbg = (f) =>
            return (m) -> winston.debug("Zendesk.#{f}: #{m}")

        dbg    = @dbg("constructor")
        @_zd   = null

        async.waterfall([
            (cb) =>
                dbg("loading zendesk password from disk")
                password_file = zendesk_password_filename()
                fs.exists password_file, (exists) =>
                    if exists
                        fs.readFile password_file, (err, data) =>
                            if err
                                cb(err)
                            else
                                dbg("read zendesk password from '#{password_file}'")
                                creds = data.toString().trim().split(':')
                                cb(null, creds[0], creds[1])
                    else
                        dbg("no password file found at #{password_file}")
                        cb(null, null, null)

            (username, password, cb) =>
                if username? and password?
                    zendesk = require('node-zendesk')
                    # username already has /token postfix, otherwise set "token" instead of "password"
                    zd = zendesk.createClient
                                username   : username,
                                password   : password,
                                remoteUri  : 'https://sagemathcloud.zendesk.com/api/v2'
                    cb(null, zd)
                else
                    cb(null, null)

        ], (err, zendesk_client) =>
            if err
                dbg("error initializing zendesk -- #{misc.to_json(err)}")
            else
                dbg("successfully initialized zendesk")
                @_zd = zendesk_client
            opts.cb?(err, @)
        )


    ###
    # Start of high-level SMC API for support tickets
    ###

    # List recent tickets (basically a test if the API client works)
    # https://developer.zendesk.com/rest_api/docs/core/tickets#list-tickets
    recent_tickets: (cb) ->
        @_zd?.tickets.listRecent (err, statusList, body, responseList, resultList) =>
            if (err)
                console.log(err)
                return
            dbg = @dbg("recent_tickets")
            dbg(JSON.stringify(body, null, 2, true))
            cb?(body)

    get_support_tickets: (account_id, cb) ->
        dbg = @dbg("get_support_tickets")
        dbg("args: #{account_id}")
        if not @_zd?
            err = "Support ticket backend is not available."
            dbg(err)
            cb?(err)
            return

        query_zendesk = (account_id, cb) =>
            # zendesk query, looking for tickets tagged with the account_id
            # https://support.zendesk.com/hc/en-us/articles/203663226
            q = "type:ticket fieldvalue:#{account_id}"
            dbg("query = #{q}")
            @_zd.search.query q, (err, req, result) =>
                if err
                    cb(err); return
                cb(null, result)

        process_result = (raw, cb) =>
            # post-processing zendesk list
            # dbg("raw = #{JSON.stringify(raw, null, 2, true)}")
            tickets = []
            for r in raw
                t = _.pick(r, 'id', 'subject', 'description', 'created_at', 'updated_at', 'status')
                t.url = misc.ticket_id_to_ticket_url(t.id)
                tickets.push(t)
            cb(null, tickets)

        async.waterfall([
            async.apply(query_zendesk, account_id)
            process_result
        ], (err, tickets) =>
            if err
                cb?(err)
            else
                cb?(null, tickets)
        )

    # mapping of incoming data from SMC to the API of Zendesk
    # https://developer.zendesk.com/rest_api/docs/core/tickets#create-ticket
    create_ticket: (opts, cb) ->
        opts = defaults opts,
            email_address : required  # if there is no email_address in the account, there can't be a ticket!
            username      : undefined
            subject       : required  # like an email subject
            body          : required  # html or md formatted text
            tags          : undefined
            account_id    : undefined
            location      : undefined # URL
            info          : {}        # additional data dict, like browser/OS

        dbg = @dbg("create_ticket")
        # dbg("opts = #{misc.to_json(opts)}")

        if not @_zd?
            err = "Support ticket backend is not available."
            dbg(err)
            cb?(err)
            return

        # data assembly, we need a special formatted user and ticket object
        # name: must be at least one character, even " " is causing errors
        # https://developer.zendesk.com/rest_api/docs/core/users
        user =
            user:
                name         : if opts.username?.trim?().length > 0 then opts.username else opts.email_address
                email        : opts.email_address
                external_id  : opts.account_id ? null
                # manage custom_fields here: https://sagemathcloud.zendesk.com/agent/admin/user_fields
                #custom_fields:
                #    subscription : null
                #    type         : null

        tags = opts.tags ? []

        # https://sagemathcloud.zendesk.com/agent/admin/ticket_fields
        # Also, you have to read the API info (way more complex than you might think!)
        # https://developer.zendesk.com/rest_api/docs/core/tickets#setting-custom-field-values
        cus_fld_id =
            account_id: 31614628
            project_id: 30301277
            location  : 30301287
            browser   : 31647548
            mobile    : 31647578
            internet  : 31665978
            hostname  : 31665988
            course    : 31764067
            quotas    : 31758818
            info      : 31647558

        custom_fields = [
            {id: cus_fld_id.account_id, value: opts.account_id      ? ''}
            {id: cus_fld_id.project_id, value: opts.info.project_id ? ''}
            {id: cus_fld_id.location  , value: opts.location        ? ''}
            {id: cus_fld_id.browser   , value: opts.info.browser    ? 'unknown'}
            {id: cus_fld_id.mobile    , value: opts.info.mobile     ? 'unknown'}
            {id: cus_fld_id.internet  , value: opts.info.internet   ? 'unknown'}
            {id: cus_fld_id.hostname  , value: opts.info.hostname   ? 'unknown'}
            {id: cus_fld_id.course    , value: opts.info.course     ? 'unknown'}
            {id: cus_fld_id.quotas    , value: opts.info.quotas     ? 'unknown'}
        ]

        # getting rid of those fields, which we have picked above -- keeps extra fields.
        remaining_info = _.omit(opts.info, _.keys(cus_fld_id))
        custom_fields.push(id: cus_fld_id.info, value: JSON.stringify(remaining_info))

        # fix any copy/pasted links from inside the body of the message to replace an optional session
        body = fixSessions(opts.body)

        # below the body message, add a link to the location
        # TODO fix hardcoded URL
        if opts.location?
            url  = "https://" + path.join(theme.DNS, opts.location)
            body = body + "\n\n#{url}?session="
        else
            body = body + "\n\nNo location provided."

        if misc.is_valid_uuid_string(opts.info.course)
            body += "\n\nCourse: #{theme.DOMAIN_NAME}/projects/#{opts.info.course}?session="

        # https://developer.zendesk.com/rest_api/docs/core/tickets#request-parameters
        ticket =
            ticket:
                subject: opts.subject
                comment:
                    body : body
                tags   : tags
                type   : "problem"
                custom_fields: custom_fields

        # data assembly finished → creating or updating existing zendesk user, then sending ticket creation

        async.waterfall([
            # 1. get or create user ID in zendesk-land
            (cb) =>
                if DEBUG
                    cb(null, 1234567890)
                else
                    # workaround, until https://github.com/blakmatrix/node-zendesk/pull/131/files is in
                    @_zd.users.request 'POST', ['users', 'create_or_update'], user, (err, req, result) =>
                        if err
                            dbg("create_or_update user error: #{misc.to_json(err)}")
                            try
                                # we HAVE had uncaught exceptions here in production
                                # logged in the central_error_log!
                                err = "#{misc.to_json(misc.from_json(err.result))}"
                            catch
                                # evidently err.result is not valid json so can't do better than to string it
                                err = "#{err.result}"
                            #if err.result?.type == "Buffer"
                            #    err = err.result.data.map((c) -> String.fromCharCode(c)).join('')
                            #    dbg("create_or_update zendesk message: #{err}")
                            cb(err); return
                        # result = { "id": int, "url": "https://…json", "name": …, "email": "…", "created_at": "…", "updated_at": "…", … }
                        # dbg(JSON.stringify(result, null, 2, true))
                        cb(null, result.id)

            # 2. creating ticket with known zendesk user ID (an integer number)
            (requester_id, cb) =>
                dbg("create ticket #{misc.to_json(ticket)} with requester_id: #{requester_id}")
                ticket.ticket.requester_id = requester_id
                if DEBUG
                    cb(null, Math.floor(Math.random() * 1e6 + 999e7))
                else
                    @_zd.tickets.create ticket, (err, req, result) =>
                        if (err)
                            cb(err); return
                        # dbg(JSON.stringify(result, null, 2, true))
                        cb(null, result.id)

            # 3. store ticket data, timestamp, and zendesk ticket number in our own DB
            (ticket_id, cb) =>
                # TODO: NYI
                cb(null, ticket_id)

        ], (err, ticket_id) =>
            # dbg("done! ticket_id: #{ticket_id}, err: #{err}, and callback: #{@cb?}")
            if err
                cb?(err)
            else
                url = misc.ticket_id_to_ticket_url(ticket_id)
                cb?(null, url)
        )


if SMC_TEST
    exports.fixSessions = fixSessions
