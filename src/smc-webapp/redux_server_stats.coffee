#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Redux: server stats
###

{COCALC_MINIMAL} = require ("./fullscreen")
{Table, redux} = require('./app-framework')

name    = 'server_stats'
store   = redux.createStore(name, {loading:true})
actions = redux.createActions(name)

$ = window.$
{BASE_URL} = require('misc_page')
get_stats = ->
    $.getJSON "#{BASE_URL}/stats", (data) ->
        data.time = new Date(data.time)
        data.loading = false
        actions.setState(data)
    setTimeout(get_stats, 90 * 1000)

if not COCALC_MINIMAL
    get_stats()

#class StatsTable extends Table

#    query: ->
#        return 'stats'
#
#    _change: (table, keys) =>
#        newest = undefined
#        for obj in table.get(keys).toArray()
#            if obj? and (not newest? or obj.get('time') > newest.get('time'))
#                newest = obj
#        if newest?
#            newest = newest.toJS()
#            newest.time = new Date(newest.time)
#            newest.loading = false
#            actions.setState(newest)
#

#redux.createTable(name, StatsTable)