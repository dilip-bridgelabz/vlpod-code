/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for editing R markdown documents
*/

import { RenderedMarkdown } from "../markdown-editor/rendered-markdown";
import { set } from "smc-util/misc2";
import { derive_rmd_output_filename } from "./utils";
import { createEditor } from "../frame-tree/editor";
import { CodemirrorEditor } from "../code-editor/codemirror-editor";
import { SETTINGS_SPEC } from "../settings/editor";
import { IFrameHTML } from "../html-editor/iframe-html";
import { PDFJS } from "../latex-editor/pdfjs";
import { pdfjs_buttons } from "../latex-editor/editor";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { BuildLog } from "./build-log";

const EDITOR_SPEC = {
  cm: {
    short: "Code",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "replace",
      "find",
      "goto_line",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
      "format",
      "build",
    ]),
  },

  iframe: {
    short: "HTML",
    name: "HTML (Converted)",
    icon: "compass",
    component: IFrameHTML,
    mode: "rmd",
    path(path) {
      return derive_rmd_output_filename(path, "html");
    },
    buttons: set([
      "print",
      "save",
      "time_travel",
      "reload",
      "decrease_font_size",
      "increase_font_size",
    ]),
  },

  // By default, only html is generated. This viewer is still there in case the user explicitly tells RMarkdown to generate a PDF

  pdfjs_canvas: {
    short: "PDF",
    name: "PDF (Converted)",
    icon: "file-pdf-o",
    component: PDFJS,
    mode: "rmd",
    buttons: pdfjs_buttons,
    style: { background: "#525659" },
    renderer: "canvas",
    path(path) {
      return derive_rmd_output_filename(path, "pdf");
    },
  },

  markdown: {
    short: "Markdown",
    name: "Markdown (only rendered)",
    icon: "eye",
    component: RenderedMarkdown,
    reload_images: true,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "reload",
    ]),
  },

  build: {
    short: "Build Log",
    name: "Build Log",
    icon: "gears",
    component: BuildLog,
    style: { background: "#525659" },
    buttons: set(["build", "decrease_font_size", "increase_font_size"]),
  },

  terminal,

  time_travel,

  settings: SETTINGS_SPEC,
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "RmdEditor",
});
