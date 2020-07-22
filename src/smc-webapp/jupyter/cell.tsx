/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that describes a single cella
*/

import { Map } from "immutable";
import { React, Rendered, useDelayedRender } from "../app-framework";
import { clear_selection } from "../misc/clear-selection";
import { COLORS } from "smc-util/theme";
import { INPUT_PROMPT_COLOR } from "./prompt";
import { Icon, Tip } from "../r_misc";
import { CellInput } from "./cell-input";
import { CellOutput } from "./cell-output";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

import { NBGraderMetadata } from "./nbgrader/cell-metadata";

interface Props {
  actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  name?: string;
  id: string;
  index: number;
  cm_options: Map<string, any>;
  cell: Map<string, any>; // TODO: types
  is_current?: boolean;
  is_selected?: boolean;
  is_markdown_edit?: boolean;
  mode: "edit" | "escape";
  font_size: number;
  project_id?: string;
  directory?: string;
  complete?: Map<string, any>; // TODO: types
  is_focused?: boolean;
  more_output?: Map<string, any>; // TODO: types
  cell_toolbar?: string;
  trust?: boolean;
  hook_offset?: number;
  is_scrolling?: boolean;
  height?: number; // optional fixed height
}

function areEqual(props: Props, nextProps: Props): boolean {
  // note: we assume project_id and directory don't change
  return !(
    nextProps.id !== props.id ||
    nextProps.index !== props.index ||
    nextProps.cm_options !== props.cm_options ||
    nextProps.cell !== props.cell ||
    nextProps.is_current !== props.is_current ||
    nextProps.is_selected !== props.is_selected ||
    nextProps.is_markdown_edit !== props.is_markdown_edit ||
    nextProps.mode !== props.mode ||
    nextProps.font_size !== props.font_size ||
    nextProps.is_focused !== props.is_focused ||
    nextProps.more_output !== props.more_output ||
    nextProps.cell_toolbar !== props.cell_toolbar ||
    nextProps.trust !== props.trust ||
    nextProps.is_scrolling !== props.is_scrolling ||
    nextProps.height !== props.height ||
    (nextProps.complete !== props.complete && // only worry about complete when editing this cell
      (nextProps.is_current || props.is_current))
  );
}

export const Cell: React.FC<Props> = React.memo((props) => {
  // only delay rendering if actions are set (otherwise we break share server)
  const render = useDelayedRender(props.actions == null ? 0 : props.index);
  if (!render) {
    return <></>;
  }

  function is_editable(): boolean {
    return props.cell.getIn(["metadata", "editable"], true);
  }

  function is_deletable(): boolean {
    return props.cell.getIn(["metadata", "deletable"], true);
  }

  function nbgrader_state(): undefined | Map<string, any> {
    return props.cell.getIn(["metadata", "nbgrader"]);
  }

  function render_cell_input(cell: Map<string, any>): Rendered {
    return (
      <CellInput
        key="in"
        cell={cell}
        actions={props.actions}
        frame_actions={props.frame_actions}
        cm_options={props.cm_options}
        is_markdown_edit={!!props.is_markdown_edit}
        is_focused={!!(props.is_current && props.mode === "edit")}
        is_current={!!props.is_current}
        id={props.id}
        index={props.index}
        font_size={props.font_size}
        project_id={props.project_id}
        directory={props.directory}
        complete={props.is_current ? props.complete : undefined}
        cell_toolbar={props.cell_toolbar}
        trust={props.trust}
        is_readonly={!is_editable()}
        is_scrolling={props.is_scrolling}
      />
    );
  }

  function render_cell_output(cell: Map<string, any>): Rendered {
    return (
      <CellOutput
        key="out"
        cell={cell}
        actions={props.actions}
        frame_actions={props.frame_actions}
        name={props.name}
        id={props.id}
        project_id={props.project_id}
        directory={props.directory}
        more_output={props.more_output}
        trust={props.trust}
        complete={props.is_current && props.complete != null}
      />
    );
  }

  function click_on_cell(event: any): void {
    if (props.frame_actions == null) {
      return;
    }
    if (event.shiftKey && !props.is_current) {
      clear_selection();
      props.frame_actions.select_cell_range(props.id);
      return;
    }
    props.frame_actions.set_cur_id(props.id);
    props.frame_actions.unselect_all_cells();
  }

  function double_click(event: any): void {
    if (props.frame_actions == null) {
      return;
    }
    if (props.cell.getIn(["metadata", "editable"]) === false) {
      return;
    }
    if (props.cell.get("cell_type") !== "markdown") {
      return;
    }
    props.frame_actions.unselect_all_cells();
    const id = props.cell.get("id");
    props.frame_actions.set_md_cell_editing(id);
    props.frame_actions.set_cur_id(id);
    props.frame_actions.set_mode("edit");
    event.stopPropagation();
  }

  function render_not_deletable(): Rendered {
    if (is_deletable()) return;
    return (
      <Tip
        title={"Protected from deletion"}
        placement={"right"}
        size={"small"}
        style={{ marginRight: "5px" }}
      >
        <Icon name="ban" />
      </Tip>
    );
  }

  function render_not_editable(): Rendered {
    if (is_editable()) return;
    return (
      <Tip
        title={"Protected from modifications"}
        placement={"right"}
        size={"small"}
        style={{ marginRight: "5px" }}
      >
        <Icon name="lock" />
      </Tip>
    );
  }

  function render_nbgrader(): Rendered {
    const nbgrader = nbgrader_state();
    if (nbgrader == null) return;
    return (
      <span>
        <Icon name="graduation-cap" style={{ marginRight: "5px" }} />
        <NBGraderMetadata
          nbgrader={nbgrader}
          start={props.cell.get("start")}
          state={props.cell.get("state")}
          output={props.cell.get("output")}
        />
      </span>
    );
  }

  function render_metadata_state(): Rendered {
    let style: React.CSSProperties;

    // note -- that second part is because the official
    // nbgrader demo has tons of cells with all the metadata
    // empty... which *cocalc* would not produce, but
    // evidently official tools do.
    const nbgrader = nbgrader_state();
    const no_nbgrader: boolean =
      nbgrader == null ||
      (!nbgrader.get("grade") &&
        !nbgrader.get("solution") &&
        !nbgrader.get("locked"));
    if (no_nbgrader) {
      // Will not need more than two tiny icons.
      // If we add more metadata state indicators
      // that may take a lot of space, check for them
      // in the condition above.
      style = {
        position: "absolute",
        top: "2px",
        left: "5px",
        whiteSpace: "nowrap",
        color: COLORS.GRAY_L,
      };
    } else {
      // Need arbitrarily much horizontal space, so we
      // get our own line.
      style = { color: COLORS.GRAY_L, marginBottom: "5px" };
    }

    if (props.is_current || props.is_selected) {
      // style.color = COLORS.BS_RED;
      style.color = INPUT_PROMPT_COLOR; // should be the same as the prompt; it's not an error.
    }

    if (props.height) {
      style.height = props.height + "px";
      style.overflowY = "scroll";
    }

    return (
      <div style={style}>
        {render_not_deletable()}
        {render_not_editable()}
        {no_nbgrader ? undefined : render_nbgrader()}
      </div>
    );
  }

  let color1: string, color2: string;
  if (props.is_current) {
    // is the current cell
    if (props.mode === "edit") {
      // edit mode
      color1 = color2 = "#66bb6a";
    } else {
      // escape mode
      if (props.is_focused) {
        color1 = "#ababab";
        color2 = "#42a5f5";
      } else {
        color1 = "#eee";
        color2 = "#42a5ff";
      }
    }
  } else {
    if (props.is_selected) {
      color1 = color2 = "#e3f2fd";
    } else {
      color1 = color2 = "white";
    }
  }
  const style: React.CSSProperties = {
    border: `1px solid ${color1}`,
    borderLeft: `5px solid ${color2}`,
    padding: "2px 5px",
    position: "relative",
  };

  if (props.is_selected) {
    style.background = "#e3f2fd";
  }

  // Note that the cell id is used for scroll functionality, so *is* important.
  return (
    <div
      style={style}
      onMouseUp={props.is_current ? undefined : click_on_cell}
      onDoubleClick={double_click}
      id={props.id}
      cocalc-test={"jupyter-cell"}
    >
      {render_metadata_state()}
      {render_cell_input(props.cell)}
      {render_cell_output(props.cell)}
    </div>
  );
}, areEqual);
