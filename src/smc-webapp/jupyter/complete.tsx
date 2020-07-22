/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare const $: any;

import { React, Component, Rendered } from "../app-framework";
import { Map } from "immutable";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

interface CompleteProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  id: string;
  complete: Map<string, any>;
}

// WARNING: Complete closing when clicking outside the complete box
// is handled in cell-list on_click.  This is ugly code (since not localized),
// but seems to work well for now.  Could move.
export class Complete extends Component<CompleteProps> {
  private node: HTMLElement;

  private select(item: string): void {
    // Save contents of editor to the store so that completion properly *places* the
    // completion in the correct place: see https://github.com/sagemathinc/cocalc/issues/3978
    this.props.frame_actions.save_input_editor(this.props.id);

    // Actually insert the completion:
    this.props.actions.select_complete(this.props.id, item);

    // Start working on the cell:
    this.props.frame_actions.set_mode("edit");
  }

  private render_item(item: string): Rendered {
    return (
      <li key={item}>
        <a role="menuitem" tabIndex={-1} onClick={() => this.select(item)}>
          {item}
        </a>
      </li>
    );
  }

  private keypress = (evt: any) => {
    this.props.actions.complete_handle_key(this.props.id, evt.keyCode);
  };

  public componentDidMount(): void {
    $(window).on("keypress", this.keypress);
    $(this.node).find("a:first").focus();
  }

  public componentDidUpdate(): void {
    $(this.node).find("a:first").focus();
  }

  public componentWillUnmount(): void {
    $(window).off("keypress", this.keypress);
  }

  private key(e: any): void {
    if (e.keyCode === 27) {
      this.props.actions.clear_complete();
      this.props.frame_actions.set_mode("edit");
    }
    if (e.keyCode !== 13) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const item = $(this.node).find("a:focus").text();
    this.select(item);
  }

  private get_style(): React.CSSProperties {
    const top = this.props.complete.getIn(["offset", "top"], 0);
    const left = this.props.complete.getIn(["offset", "left"], 0);
    const gutter = this.props.complete.getIn(["offset", "gutter"], 0);
    return {
      cursor: "pointer",
      top: top + "px",
      left: left + gutter + "px",
      opacity: 0.95,
      zIndex: 10,
      width: 0,
      height: 0,
    };
  }

  private get_items(): Rendered[] {
    return this.props.complete
      .get("matches", [])
      .map(this.render_item.bind(this));
  }

  public render(): Rendered {
    return (
      <div
        className="dropdown open"
        style={this.get_style()}
        ref={(node: any) => (this.node = node)}
      >
        <ul
          className="dropdown-menu cocalc-complete"
          onKeyDown={this.key.bind(this)}
        >
          {this.get_items()}
        </ul>
      </div>
    );
  }
}
