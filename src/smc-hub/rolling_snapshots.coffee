#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Create rolling snapshots of a given ZFS volume
###

fs          = require('fs')
async       = require('async')
winston     = require('./winston-metrics').get_logger('rolling_snapshots')

misc_node = require('smc-util-node/misc_node')
misc      = require('smc-util/misc')
{defaults, required} = misc

list_snapshots = (filesystem, cb) ->
    misc_node.execute_code
        command : 'sudo'
        args    : ['zfs', 'list', '-r', '-H', '-t', 'snapshot', filesystem]
        cb      : (err, output) ->
            if err
                cb(err)
            else
                v = (misc.split(x)[0].split('@')[1] for x in output.stdout.split('\n') when x.trim())
                v.sort()
                cb(undefined, v)

make_snapshot = (filesystem, snap, cb) ->
    async.series([
        (cb) ->
            misc_node.execute_code
                command : 'sudo'
                args    : ['zfs', 'snapshot', "#{filesystem}@#{snap}"]
                cb      : cb
        (cb) ->
            # read the directory to cause it to be mounted
            fs.readdir("/#{filesystem}/.zfs/snapshot/#{snap}/", cb)
    ], cb)

delete_snapshot = (filesystem, snap, cb) ->
    misc_node.execute_code
        command : 'sudo'
        args    : ['zfs', 'destroy', "#{filesystem}@#{snap}"]
        cb      : cb

INTERVALS =
    five    : 5
    hourly  : 60
    daily   : 60*24
    weekly  : 60*24*7
    monthly : 60*24*7*4

exports.update_snapshots = (opts) ->
    opts = defaults opts,
        filesystem : required
        five       : 12*6   # 6 hours worth of five-minute snapshots to retain
        hourly     : 24*7   # 1 week of hourly snapshots
        daily      : 30     # 1 month of daily snapshots
        weekly     : 8      # 2 months of weekly snapshots
        monthly    : 6      # 6 months of monthly snapshots
        cb         : undefined
    dbg = (m) -> winston.debug("snapshot('#{opts.filesystem}'): #{m}")
    dbg()
    snapshots = undefined
    to_create = []
    to_delete = []
    async.series([
        (cb) ->
            dbg("get list of all snapshots")
            list_snapshots opts.filesystem, (err, x) ->
                snapshots = x; cb(err)
        (cb) ->
            dbg("got #{snapshots.length} snapshots")
            # determine which snapshots we need to make
            now = new Date()
            for name, interval of INTERVALS
                if opts[name] <= 0 # not making any of these
                    continue
                # Is there a snapshot with the given name that is within the given
                # interval of now?  If not, make snapshot.
                v = (s for s in snapshots when misc.endswith(s, '-'+name))
                if v.length > 0
                    newest = v[v.length-1]
                    t = misc.parse_bup_timestamp(newest)
                    age_m = (now - t)/(60*1000)   # age in minutes since snapshot
                else
                    age_m = 999999999999  # 'infinite'
                if age_m > interval
                    # will make this snapshot
                    to_create.push("#{misc.to_iso_path(now)}-#{name}")
                # Are there too many snapshots of the given type?  If so, delete them
                if v.length > opts[name]
                    for s in v.slice(0, v.length - opts[name])
                        to_delete.push(s)
            cb()
        (cb) ->
            dbg("snapshots to make: #{misc.to_json(to_create)}")
            if to_create.length > 0
                f = (snap, cb) ->
                    make_snapshot(opts.filesystem, snap, cb)
                async.map(to_create, f, cb)
            else
                cb()
        (cb) ->
            dbg("snapshots to delete: #{to_delete}")
            if to_delete.length > 0
                f = (snap, cb) ->
                    delete_snapshot(opts.filesystem, snap, cb)
                async.map(to_delete, f, cb)
            else
                cb()
    ], (err) -> opts.cb?(err))
