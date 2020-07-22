/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Provide nice JSON view of the ipynb
*/

import { React, Component } from "../app-framework";
import { Map } from "immutable";
const Inspector = require("react-json-inspector");
import { JupyterActions } from "./browser-actions";
import { Loading } from "../r_misc";

interface JSONViewProps {
  actions: JupyterActions;
  font_size?: number;
  cells: Map<string, any>; // to cause update when these change.
}

export class JSONView extends Component<JSONViewProps> {
  render() {
    const data = this.props.actions.store.get_ipynb();
    if (data == null) {
      return <Loading />;
    }
    return (
      <div
        style={{
          fontSize: `${this.props.font_size}px`,
          paddingLeft: "20px",
          padding: "20px",
          backgroundColor: "#eee",
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            backgroundColor: "#fff",
            padding: "15px",
            boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
            position: "relative",
          }}
        >
          <div
            style={{
              color: "#666",
              fontSize: "12pt",
              right: "15px",
              position: "absolute",
              background: "white",
            }}
          >
            Read-only view of notebook's underlying object structure.
          </div>
          <Inspector data={data} />
        </div>
      </div>
    );
  }
}
