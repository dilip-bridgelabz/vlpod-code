#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# Deprecated -- tons of work, but really Kubernetes is the way to go...

###########################
# Command line interface for VM manager
###########################

{join}      = require('path')

winston   = require('./winston-metrics').get_logger('smc-vm-manager')
async     = require('async')
misc_node = require('smc-util-node/misc_node')
program   = require('commander')

LOGS = join(process.env.HOME, 'logs')
program.usage('[start/stop/restart/status] [options]')
    .option('--pidfile [string]', 'store pid in this file', String, "#{LOGS}/smc-vm-manager.pid")
    .option('--logfile [string]', 'write log to this file', String, "#{LOGS}/smc-vm-manager.log")
    .option('--db [string]', 'comma separated database servers', String, process.env.SMC_DB_HOSTS ? 'db0')
    .option('-e')   # gets passed by coffee -e
    .parse(process.argv)

db_hosts = program.db.split(',')

start_server = () ->
    require('smc-hub/rethink').rethinkdb
        hosts : db_hosts
        pool  : 1
        cb    : (err, db) =>
            g = require('smc-hub/smc_gcloud.coffee').gcloud(db:db)
            vms = g.vm_manager()

main = () ->
    winston.debug("running as a deamon")
    # run as a server/daemon (otherwise, is being imported as a library)
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")

    async.series([
        (cb) ->
            misc_node.ensure_containing_directory_exists(program.pidfile, cb)
        (cb) ->
            misc_node.ensure_containing_directory_exists(program.logfile, cb)
        (cb) ->
            daemon  = require("start-stop-daemon")  # don't import unless in a script; otherwise breaks in node v6+
            daemon({max:9999, pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null'}, start_server)
    ])

if program._name.split('.')[0] == 'smc-vm-manager'
    main()
