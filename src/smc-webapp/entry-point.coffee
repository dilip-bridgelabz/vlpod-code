#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
# Global app initialization
###

fullscreen = require('./fullscreen')

# FUTURE: This is needed only for the old non-react editors; will go away.
html = require('./console.html') + require('./editor.html') + require('./jupyter.html') + require('./sagews/interact.html') + require('./sagews/3d.html') + require('./sagews/d3.html')
$('body').append(html)

# deferred initialization of buttonbars until after global imports -- otherwise, the sagews sage mode bar might be blank
{init_buttonbars} = require('./editors/editor-button-bar')
init_buttonbars()

# Load/initialize Redux-based react functionality
{redux} = require('./app-framework')

# Initialize server stats redux store
require('./redux_server_stats')

# Systemwide notifications that are broadcast to all users (and set by admins)
require('./system-notifications')

require('./launch/actions')

# Various jquery plugins:
require('./jquery_plugins')
# Another jquery plugin:
require('./process-links')

###
# Initialize app stores, actions, etc.
###
require('./app/init')
require("./custom-software/init").init()
require('./account').init(redux)
require("./file-use/init")
require('./webapp-hooks')

if not fullscreen.COCALC_MINIMAL
    notifications = require('./notifications')
    notifications.init(redux)

require('./widget-markdown-input/main').init(redux)

# only enable iframe comms in minimal kiosk mode
if fullscreen.COCALC_MINIMAL
    require('./iframe-communication').init()

{render} = require('./app/render')
render()

$(window).on('beforeunload', redux.getActions('page').check_unload)

# Should be loaded last
require('./last')

# adding a banner in case react crashes (it will be revealed)
crash = require('./crash.html')
{ HELP_EMAIL } = require('smc-util/theme')
$('body').append(crash.replace(/HELP_EMAIL/g, HELP_EMAIL))

