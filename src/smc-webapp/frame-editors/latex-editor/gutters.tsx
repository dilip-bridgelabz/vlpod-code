/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Manage codemirror gutters that highlight latex typesetting issues.
//
// NOTE: If there are multiple errors/warnings/etc., on the SAME line, only the last
// one gets a gutter mark, with pref to errors.  The main error log shows everything, so this should be OK.

import * as React from "react";
import { capitalize } from "smc-util/misc2";
import { Icon, Tip } from "smc-webapp/r_misc";
import { SPEC, SpecItem } from "./errors-and-warnings";
import { IProcessedLatexLog, Error } from "./latex-log-parser";

export function update_gutters(opts: {
  log: IProcessedLatexLog;
  set_gutter: Function;
}): void {
  for (const group of ["typesetting", "warnings", "errors"]) {
    // errors last so always shown if multiple issues on a single line!
    let item: Error;
    for (item of opts.log[group]) {
      if (!item.file) continue;
      if (item.line == null) {
        /* no gutter mark in a line if there is no line number, e.g., "there were missing refs" */
        continue;
      }
      opts.set_gutter(
        item.file,
        item.line - 1,
        component(item.level, item.message, item.content)
      );
    }
  }
}

function component(
  level: string,
  message: string,
  content: string | undefined
) {
  const spec: SpecItem = SPEC[level];
  if (content === undefined) {
    content = message;
    message = capitalize(level);
  }
  // NOTE/BUG: despite allow_touch true below, this still does NOT work on my iPad -- we see the icon, but nothing
  // happens when clicking on it; this may be a codemirror issue.
  return (
    <Tip
      title={message}
      tip={content}
      placement={"right"}
      icon={spec.icon}
      stable={true}
      popover_style={{
        padding: 0,
        opacity: 0.9,
        border: `2px solid ${spec.color}`,
        borderRadius: "3px",
      }}
      delayShow={0}
      allow_touch={true}
    >
      <Icon name={spec.icon} style={{ color: spec.color, cursor: "pointer" }} />
    </Tip>
  );
}
