#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Add collaborators to a project
###

{React, ReactDOM, redux, rtypes, rclass, Fragment}  = require('../app-framework')

{Alert, Button, ButtonToolbar, FormControl, FormGroup, Well, Checkbox} = require('react-bootstrap')

{Icon, LabeledRow, Loading, MarkdownInput, SearchInput, ErrorDisplay, TimeAgoElement} = require('../r_misc')

{webapp_client}      = require('../webapp-client')

{ has_internet_access } = require("../upgrades/upgrade-utils");

{SITE_NAME} = require('smc-util/theme')

{contains_url} = require('smc-util/misc2')

exports.AddCollaborators = rclass
    displayName : 'ProjectSettings-AddCollaborators'

    propTypes :
        project : rtypes.immutable.Map.isRequired
        inline  : rtypes.bool
        allow_urls : rtypes.bool

    reduxProps :
        account :
            get_fullname : rtypes.func
        users :
            user_map    : rtypes.immutable

    getInitialState: ->
        search           : ''          # search that user has typed in so far
        select           : undefined   # list of results for doing the search -- turned into a selector
        selected_entries : undefined   # list of actually selected entries in the selector list
        searching        : false       # currently carrying out a search
        err              : ''          # display an error in case something went wrong doing a search
        email_to         : ''          # if set, adding user via email to this address
        email_body       : ''          # with this body.
        email_body_error : undefined

    reset: ->
        @setState(@getInitialState())

    do_search: (search) ->
        search = search.trim()
        @setState(search: search, selected_entries : undefined)  # this gets used in write_email_invite, and whether to render the selection list.
        if @state.searching
             # already searching
             return
        if search.length == 0
             @setState(err:undefined, select:undefined)
             return
        @setState(searching:true)
        err = undefined
        try
            users = await webapp_client.users_client.user_search(query:search, limit:50)
        catch e
            err = e.toString()
        @write_email_invite()
        @setState(searching:false, err:err, select:users, email_to:undefined)

    render_options: (select) ->
        if @props.user_map?
            x = []; y = []
            for r in select
                if @props.user_map.get(r.account_id)
                    x.push(r)
                else
                    y.push(r)
            select = x.concat(y)

        for r in select
            name = r.first_name + ' ' + r.last_name

            # Extra display is a bit ugly, but we need to do it for now.  Need to make
            # react rendered version of this that is much nicer (with pictures!) someday.
            extra = []
            if @props.user_map?.get(r.account_id)
                extra.push("Collaborator")
            if r.last_active
                extra.push("Last active: #{new Date(r.last_active).toLocaleDateString()}")
            if r.created
                extra.push("Created: #{new Date(r.created).toLocaleDateString()}")
            if r.email_address
                if r.email_address_verified?[r.email_address]
                    extra.push("Email verified: YES")
                else
                    extra.push("Email verified: NO")
            if extra.length > 0
                name += "  (#{extra.join(', ')})"
            <option key={r.account_id} value={r.account_id} label={name}>{name}</option>

    invite_collaborator: (account_id) ->
        # project_id, account_id, body, subject, silent, replyto,  replyto_name
        replyto      = redux.getStore('account').get_email_address()
        replyto_name = redux.getStore('account').get_fullname()
        SiteName     = redux.getStore('customize').get("site_name") ? SITE_NAME
        if replyto_name?
            subject = "#{replyto_name} added you to #{SiteName} project #{@props.project.get('title')}"
        else
            subject = "You've been added to #{SiteName} project #{@props.project.get('title')}"
        @actions('projects').invite_collaborator(
            @props.project.get('project_id'),
            account_id,
            @state.email_body,
            subject,
            false,
            replyto,
            replyto_name
        )

    add_selected: (select) ->
        @reset()
        # handle case, where just one name is listed → clicking on "add" would clear everything w/o inviting
        if (not @state.selected_entries? or @state.selected_entries?.length == 0) and select?.length == 1
            @invite_collaborator(select[0].account_id)
        else
            for option in @state.selected_entries
                @invite_collaborator(option.getAttribute('value'))

    select_list_clicked: ->
        selected_names = ReactDOM.findDOMNode(@refs.select).selectedOptions
        @setState(selected_entries: selected_names)

    write_email_invite: ->
        name       = @props.get_fullname()
        project_id = @props.project.get('project_id')
        title      = @props.project.get('title')
        target     = "project '#{title}'"
        SiteName   = redux.getStore('customize').get("site_name") ? SITE_NAME
        body       = "Hello!\n\nPlease collaborate with me using #{SiteName} on #{target}.\n\nBest wishes,\n\n#{name}"
        @setState(email_to: @state.search, email_body: body)

    send_email_invite: ->
        replyto      = redux.getStore('account').get_email_address()
        replyto_name = redux.getStore('account').get_fullname()
        SiteName     = redux.getStore('customize').get("site_name") ? SITE_NAME
        if replyto_name?
            subject = "#{replyto_name} added you to project #{@props.project.get('title')}"
        else
            subject = "#{SiteName} Invitation to project #{@props.project.get('title')}"
        @actions('projects').invite_collaborators_by_email(@props.project.get('project_id'),
                                                                         @state.email_to,
                                                                         @state.email_body,
                                                                         subject,
                                                                         false,
                                                                         replyto,
                                                                         replyto_name)
        @setState(email_to:'',email_body:'')
        @reset()

    check_email_body: (value) ->
        if !@props.allow_urls and contains_url(value)
            @setState(email_body_error: "Sending URLs is not allowed. (anti-spam measure)")
        else
            @setState(email_body_error: undefined)

    render_email_body_error: ->
        return null if not this.state.email_body_error?
        return <ErrorDisplay error={this.state.email_body_error} />

    on_cancel: () ->
        @setState(email_body_editing:false, email_body_error:undefined)

    render_send_email: ->
        if not @state.email_to
            return

        <div>
            <hr />
            <Well>
                Enter one or more email addresses separated by commas:
                <FormGroup>
                    <FormControl
                        autoFocus
                        type     = 'text'
                        value    = {@state.email_to}
                        ref      = 'email_to'
                        onChange = {=>@setState(email_to:ReactDOM.findDOMNode(@refs.email_to).value)}
                        />
                </FormGroup>
                <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px', backgroundColor: 'white', marginBottom: '15px'}>
                    {@render_email_body_error()}
                    <MarkdownInput
                        default_value = {@state.email_body}
                        rows          = {8}
                        on_save       = {(value)=>@setState(email_body:value, email_body_editing:false)}
                        on_cancel     = {@on_cancel}
                        on_edit       = {=>@setState(email_body_editing:true)}
                        save_disabled = {this.state.email_body_error != null}
                        on_change     = {@check_email_body}
                    />
                </div>
                <ButtonToolbar>
                    <Button bsStyle='primary' onClick={@send_email_invite} disabled={!!@state.email_body_editing}>Send Invitation</Button>
                    <Button onClick={=>@setState(email_to:'',email_body:'', email_body_editing:false)}>Cancel</Button>
                </ButtonToolbar>
            </Well>
        </div>

    render_search: ->
        # TODO: we should not say 'search for "h"' when someone
        # has already searched for "h".
        # Instead it should be:
        #
        # - Search [...]
        # - if results.length > 0:
        #   - Select names from below to add
        #   - list of users
        #   - add button
        # - else
        #   - no results found
        #   - send invitation
        #
        if @state.search and (@state.searching or @state.select)
            <div style={marginBottom:'10px'}>Search for '{@state.search}'</div>

    render_send_email_invite: ->
        if has_internet_access(this.props.project?.get('project_id'))
            <Button style={marginBottom:'10px'} onClick={@write_email_invite}>
                <Icon name='envelope' />  Send Email Invitation...
            </Button>
        else
            <div>
                Enable the Internet Access upgrade to this project
                in project settings
                in order to send an email invitation.
            </div>


    render_select_list: ->
        if @state.searching
            return <Loading />
        if @state.err
            return <ErrorDisplay error={@state.err} onClose={=>@setState(err:'')} />
        if not @state.select? or not @state.search.trim()
            return
        select = []
        existing = []
        for r in @state.select
            if @props.project.get('users').get(r.account_id)?
                existing.push(r)
            else
                select.push(r)
        if select.length == 0
            if existing.length == 0
                <Fragment>
                    Sorry, no accounts found.
                    <br/>
                    {@render_send_email_invite()}
                </Fragment>
            else
                # no hit, but at least one existing collaborator
                collabs = ("#{r.first_name} #{r.last_name}" for r in existing).join(', ')
                <Alert bsStyle='info'>
                    Existing collaborator(s): {collabs}
                </Alert>
        else
            <div style={marginBottom:'10px'}>
                <FormGroup>
                    <FormControl
                        componentClass = {'select'}
                        multiple       = {true}
                        ref            = {'select'}
                        onClick        = {@select_list_clicked}
                    >
                        {@render_options(select)}
                    </FormControl>
                </FormGroup>
                <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px', backgroundColor: 'white', marginBottom: '15px'}>
                    {@render_email_body_error()}
                    <MarkdownInput
                        default_value = {@state.email_body}
                        rows          = {8}
                        on_save       = {(value)=>@setState(email_body:value, email_body_editing:false)}
                        on_cancel     = {@on_cancel}
                        on_edit       = {=>@setState(email_body_editing:true)}
                        save_disabled = {this.state.email_body_error != null}
                        on_change     = {@check_email_body}
                    />
                </div>
                {@render_select_list_button(select)}
            </div>


    render_select_list_button: (select) ->
        nb_selected = @state.selected_entries?.length ? 0
        btn_text = switch select.length
            when 0 then "No User Found"
            when 1 then "Add User"
            else switch nb_selected
                when 0 then undefined
                when 1 then "Add Selected User"
                else "Add #{nb_selected} Users"
        disabled = select.length == 0 or (select.length >= 2 and nb_selected == 0)
        if btn_text == undefined
            return
        <Button
            onClick  = {=>@add_selected(select)}
            disabled = {disabled}
            bsStyle  = 'primary'
        >
            <Icon name='user-plus' /> {btn_text}
        </Button>

    render_input_row: ->
        input =
            <SearchInput
                on_submit   = {@do_search}
                value       = {@state.search}
                placeholder = 'Search by name or email address...'
                on_change   = {(value) => @setState(select:undefined, search:value)}
                on_clear    = {@reset}
            />
        if @props.inline
            return input
        else
            label = <div style={fontSize:'12pt', marginTop:'6px', color:'#666', marginLeft:'15px'}>
                    Search
                    </div>
            <LabeledRow label={label}>
                {input}
            </LabeledRow>

    render: ->
        <div>
            {@render_input_row()}
            {@render_search()}
            {@render_select_list()}
            {@render_send_email()}
        </div>
