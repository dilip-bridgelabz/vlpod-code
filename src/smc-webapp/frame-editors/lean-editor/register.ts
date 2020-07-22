/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Register the LEAN theorem prover editor
*/

require("./_lean.sass");

import { Editor } from "./editor";
import { Actions } from "./actions";

import { register_file_editor } from "../frame-tree/register";

// Load plugin so that codemirror can automatically insert LEAN symbols
import "./codemirror-lean-symbols";

// Register the tab completion helper for lean mode.
require("./tab-completion");

register_file_editor({
  ext: "lean",
  component: Editor,
  Actions,
});
