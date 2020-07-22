#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Keyboard shortcuts
###

headings = require('./headings')
is_sortable = (actions) ->
    return headings.is_sortable(actions.store.getIn(['local_view_state', 'sort', 'column']))

exports.create_key_handler = (actions) ->
    return (evt) ->

        read_only = !!actions.store.get('read_only')
        mod = evt.ctrlKey or evt.metaKey or evt.altKey or evt.shiftKey

        if evt.keyCode == 70 # f = global find, with our without modifiers...
            actions.focus_find_box()
            return false
        else if evt.which == 40 or evt.which == 74    # down
            if mod
                if is_sortable(actions)
                    actions.move_task_delta(1)
            else
                actions.set_current_task_delta(1)
            return false
        else if evt.which == 38 or evt.which == 75    # up
            if mod
                if is_sortable(actions)
                    actions.move_task_delta(-1)
            else
                actions.set_current_task_delta(-1)
            return false

        if read_only
            return

        # with or without modifier
        if evt.keyCode == 83 # s = save
            actions.save()
            return false
        else if evt.keyCode == 78 # n
            actions.new_task()
            return false

        if mod and evt.which == 32  # space - need mod so user can space to scroll down.
            actions.toggle_full_desc()
            return false
        if not mod and (evt.which == 13 or evt.which == 73) # return (or i, like vim) = edit selected
            actions.edit_desc()
            return false

        return