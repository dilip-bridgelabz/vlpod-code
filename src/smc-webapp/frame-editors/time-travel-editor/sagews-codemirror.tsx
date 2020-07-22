/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is just going to be a horible wrapper around the ancient complicated
code to get this done for now.
*/

import { debounce } from "lodash";
import * as CodeMirror from "codemirror";
import { Component, React, Rendered } from "../../app-framework";
import { Map } from "immutable";

const { codemirror_editor } = require("../../editor");
const { SynchronizedWorksheet } = require("../../sagews/sagews");

interface Props {
  content: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_settings: Map<string, any>;
}

export class SagewsCodemirror extends Component<Props> {
  private update: Function;
  private view_doc: any;
  private worksheet: any;
  private cm: CodeMirror.Editor;
  private div_ref: React.RefObject<HTMLDivElement> = React.createRef<
    HTMLDivElement
  >();

  private init_sagews(): void {
    const div = this.div_ref.current;
    if (div == null) return; // can't happen

    const opts = { mode: "sagews", read_only: true };
    this.view_doc = codemirror_editor(
      this.props.project_id,
      this.props.path,
      opts
    );
    this.cm = this.view_doc.codemirror;
    // insert it into the dom.
    $(this.view_doc.element).appendTo($(div));
    // remove the second codemirror editor
    $(this.view_doc.codemirror1.getWrapperElement()).remove();

    const opts0 = {
      allow_javascript_eval: false,
      static_viewer: true,
    };
    this.worksheet = new SynchronizedWorksheet(this.view_doc, opts0);

    const f = (content: string): void => {
      if (this.view_doc == null) return;
      this.cm.setValueNoJump(content);
      this.worksheet.process_sage_updates();
    };
    f(this.props.content);
    this.update = debounce(f, 100);
  }

  public componentDidMount(): void {
    this.init_sagews();
  }

  public componentWillUnmount(): void {
    if (this.view_doc == null) return;
    this.view_doc.remove();
    delete this.view_doc;
    delete this.worksheet;
  }

  public UNSAFE_componentWillReceiveProps(props): void {
    if (props.content != this.props.content) {
      this.update(props.content);
    }
    if (props.font_size != this.props.font_size) {
      this.view_doc.set_font_size(this.cm, props.font_size);
    }
    this.cm.refresh();
  }

  public render(): Rendered {
    return (
      <div className="smc-vfill" style={{ overflow: "auto" }}>
        <div ref={this.div_ref} />
      </div>
    );
  }
}
