/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import * as onecolor from "onecolor";

export function avatar_fontcolor(bg): "white" | "black" {
  const col_bg = onecolor(bg);
  // col_bg === false happens when for unknown reasons (maybe output produced by an old buggy version of a library?),
  // the color in the profile is invalid -- {"color": "rgb(255,-8,0)", "image": ""}.
  if (col_bg === false) {
    return "white";
  }
  if (
    ((typeof col_bg?.magenta === "function" && col_bg.magenta()) || 0) >= 0.4
  ) {
    return "white";
  } else {
    return "black";
  }
}
