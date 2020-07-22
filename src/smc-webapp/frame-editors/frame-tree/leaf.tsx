/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map, Set } from "immutable";

import {
  Component,
  React,
  Rendered,
  rclass,
  rtypes,
} from "../../app-framework";
import { ErrorDisplay, Loading } from "../../r_misc";
import { AvailableFeatures } from "../../project_configuration";

import { Actions } from "../code-editor/actions";
import { EditorDescription, NodeDesc } from "./types";

interface Props {
  name: string;
  path: string;
  project_id: string;
  is_public: boolean;
  font_size: number;
  editor_state: Map<string, any>;
  active_id: string;
  editor_settings: Map<string, any>;
  terminal: Map<string, any>;
  settings: Map<string, any>;
  status: string;
  derived_file_types: Set<string>;
  available_features: AvailableFeatures;
  resize: number;
  actions: Actions;
  component: any; // ??
  spec: EditorDescription;
  desc: NodeDesc;
  editor_actions: Actions;
  is_fullscreen: boolean;
  reload?: number;
  is_subframe: boolean;
}

interface ReduxProps {
  read_only?: boolean;
  cursors?: Map<string, any>;
  value?: string;
  misspelled_words?: Set<string>;
  complete?: Map<string, any>;
  is_loaded?: boolean;
  error?: string;
  gutter_markers?: Map<string, any>;
}

class FrameTreeLeaf extends Component<Props & ReduxProps> {
  static reduxProps({ editor_actions, is_subframe }): object {
    if (editor_actions == null) {
      throw Error("bug -- editor_actions must not be null");
    }
    const { name } = editor_actions;
    if (name == null) {
      throw Error("bug -- name must not be null");
    }
    const redux_props = {
      read_only: rtypes.bool,
      cursors: rtypes.immutable.Map,
      value: rtypes.string,
      misspelled_words: rtypes.immutable.Set,
      complete: rtypes.immutable.Map,
      is_loaded: rtypes.bool,
      error: rtypes.string,
      gutter_markers: rtypes.immutable.Map,
    };
    if (!is_subframe) {
      // This is used for showing the error message right with this frame,
      // since otherwise it wouldn't be visible at all.
      delete redux_props.error;
    }
    return {
      [name]: redux_props,
    };
  }

  private render_leaf(): Rendered {
    if (!this.props.is_loaded) return <Loading theme="medium" />;
    const { desc, component, spec } = this.props;
    if (component == null) throw Error("component must not be null");
    return (
      <this.props.component
        id={desc.get("id")}
        name={this.props.name}
        actions={this.props.actions}
        editor_actions={this.props.editor_actions}
        mode={spec.mode}
        read_only={desc.get(
          "read_only",
          this.props.read_only || this.props.is_public
        )}
        is_public={this.props.is_public}
        font_size={desc.get("font_size", this.props.font_size)}
        path={this.props.path}
        fullscreen_style={spec.fullscreen_style}
        project_id={this.props.project_id}
        editor_state={this.props.editor_state.get(desc.get("id"), Map())}
        is_current={desc.get("id") === this.props.active_id}
        cursors={this.props.cursors}
        value={this.props.value}
        misspelled_words={this.props.misspelled_words}
        is_fullscreen={this.props.is_fullscreen}
        reload={this.props.reload}
        resize={this.props.resize}
        reload_images={!!spec.reload_images}
        gutters={spec.gutters != null ? spec.gutters : []}
        gutter_markers={this.props.gutter_markers}
        editor_settings={this.props.editor_settings}
        terminal={this.props.terminal}
        settings={this.props.settings}
        status={this.props.status}
        renderer={spec.renderer}
        complete={
          this.props.complete && this.props.complete.get(desc.get("id"))
        }
        derived_file_types={this.props.derived_file_types}
        desc={desc}
        available_features={this.props.available_features}
        is_subframe={this.props.is_subframe}
      />
    );
  }

  private render_error(): Rendered {
    if (
      !this.props.error ||
      this.props.desc.get("id") !== this.props.active_id
    ) {
      // either no error or not the currently selected frame (otherwise,
      // it's cluttery and there could be a bunch of the same frame all
      // showing the same error.)
      return;
    }
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => this.props.editor_actions.set_error("")}
        style={{
          maxWidth: "100%",
          margin: "1ex",
          maxHeight: "30%",
          overflowY: "scroll",
          fontFamily: "monospace",
          fontSize: "85%",
          whiteSpace: "pre-wrap",
        }}
      />
    );
  }

  public render(): Rendered {
    return (
      <div
        id={`frame-${this.props.desc.get("id")}`}
        className="smc-vfill"
        style={{ background: "white", zIndex: 1 }}
      >
        {this.render_error()}
        {this.render_leaf()}
      </div>
    );
  }
}

const FrameTreeLeaf0 = rclass(FrameTreeLeaf);
export { FrameTreeLeaf0 as FrameTreeLeaf };
