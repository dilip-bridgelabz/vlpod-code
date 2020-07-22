/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Compute the codemirror options for file with given name,
using the given editor settings.
*/

import * as CodeMirror from "codemirror";
import { file_associations } from "../../file-associations";
import * as feature from "../../feature";
import { path_split } from "smc-util/misc2";
import { get_editor_settings } from "../generic/client";
import { EDITOR_COLOR_SCHEMES } from "../../account/editor-settings/color-schemes";

import { filename_extension_notilde, defaults } from "smc-util/misc";

import { extra_alt_keys } from "./mobile";
import { Map } from "immutable";

import { valid_indent } from "./util";

function save(cm) {
  (CodeMirror as any).commands.save(cm);
}

export function default_opts(filename) {
  let key = filename_extension_notilde(filename).toLowerCase();
  if (!key) {
    key = `noext-${path_split(filename).tail}`.toLowerCase();
  }
  return file_associations[key]?.opts ?? {};
}

export function cm_options(
  filename: string, // extension determines editor mode
  editor_settings: Map<string, any>,
  gutters: string[] = [], // array of extra gutters
  editor_actions: any = undefined,
  frame_tree_actions: any = undefined,
  frame_id: string = ""
): object {
  let theme = editor_settings.get("theme");
  // if we do not know the theme, fallback to default
  if (EDITOR_COLOR_SCHEMES[theme] == null) {
    console.warn(
      `codemirror theme '${theme}' not known -- fallback to 'Default'`
    );
    theme = "default";
  }

  const opts = defaults(default_opts(filename), {
    spellcheck: false,
    undoDepth: 0, // we use our own sync-aware undo.
    mode: "txt",
    show_trailing_whitespace: editor_settings.get(
      "show_trailing_whitespace",
      true
    ),
    allow_javascript_eval: true, // if false, the one use of eval isn't allowed.
    line_numbers: editor_settings.get("line_numbers", true),
    first_line_number: editor_settings.get("first_line_number", 1),
    indent_unit: editor_settings.get("tab_size"), // TODO! indent_unit just isn't implemented -- see #2847.
    tab_size: editor_settings.get("tab_size"),
    smart_indent: editor_settings.get("smart_indent", true),
    electric_chars: editor_settings.get("electric_chars", true),
    match_brackets: editor_settings.get("match_brackets", true),
    code_folding: editor_settings.get("code_folding", true),
    auto_close_brackets: editor_settings.get("auto_close_brackets", false),
    match_xml_tags: editor_settings.get("match_xml_tags", true),
    auto_close_xml_tags: editor_settings.get("auto_close_xml_tags", true),
    auto_close_latex: editor_settings.get("auto_close_latex", true),
    line_wrapping: editor_settings.get("line_wrapping", true),
    spaces_instead_of_tabs: editor_settings.get("spaces_instead_of_tabs", true),
    style_active_line: editor_settings.get("style_active_line", true),
    bindings: editor_settings.get("bindings"),
    theme: theme,
  });

  if (opts.mode == null) {
    // to satisfy typescript
    throw Error("mode must be specified");
  }

  const extraKeys = {
    "Ctrl-'": "indentAuto",
    "Cmd-'": "indentAuto",

    "Cmd-/": "toggleComment",
    "Ctrl-/": "toggleComment", // shortcut chosen by jupyter project (undocumented)

    "Ctrl-Space": "autocomplete",
    Tab(cm) {
      tab_key(cm, opts.spaces_instead_of_tabs);
    },
    "Shift-Tab"(cm) {
      cm.unindent_selection();
    },
    "Shift-Cmd-L"(cm) {
      cm.align_assignments();
    },
    "Shift-Ctrl-L"(cm) {
      cm.align_assignments();
    },
  };

  if (feature.IS_TOUCH) {
    // maybe should be IS_IPAD... ?
    // Better more external keyboard friendly shortcuts, motivated by iPad.
    extra_alt_keys(extraKeys, editor_actions, frame_id, opts);
  }

  if (frame_tree_actions != null) {
    const build = (force = false) => {
      if (force) {
        if (frame_tree_actions.force_build !== undefined) {
          frame_tree_actions.force_build(frame_id);
        }
        return;
      }
      if (frame_tree_actions.build !== undefined) {
        frame_tree_actions.build(frame_id);
      } else {
        if (get_editor_settings().get("show_exec_warning")) {
          frame_tree_actions.set_error(
            "You can evaluate code in a file with the extension 'sagews' or 'ipynb'.   Please create a Sage Worksheet or Jupyter notebook instead."
          );
        }
      }
    };

    const actionKeys = {
      "Cmd-S"(cm) {
        save(cm);
      },
      "Alt-S"(cm) {
        save(cm);
      },
      "Ctrl-S"(cm) {
        save(cm);
      },
      "Cmd-P"() {
        editor_actions.print();
      },
      "Shift-Ctrl-."() {
        frame_tree_actions.increase_font_size(frame_id);
      },
      "Shift-Ctrl-,"() {
        frame_tree_actions.decrease_font_size(frame_id);
      },
      "Shift-Cmd-."() {
        frame_tree_actions.increase_font_size(frame_id);
      },
      "Shift-Cmd-,"() {
        frame_tree_actions.decrease_font_size(frame_id);
      },
      "Ctrl-L"(cm) {
        cm.execCommand("jumpToLine");
      },
      "Cmd-L"(cm) {
        cm.execCommand("jumpToLine");
      },
      "Cmd-F"(cm) {
        cm.execCommand("find");
      },
      "Ctrl-F"(cm) {
        cm.execCommand("find");
      },
      "Cmd-G"(cm) {
        cm.execCommand("findNext");
      },
      "Ctrl-G"(cm) {
        cm.execCommand("findNext");
      },
      "Shift-Cmd-G"(cm) {
        cm.execCommand("findPrev");
      },
      "Shift-Ctrl-G"(cm) {
        cm.execCommand("findPrev");
      },
      "Shift-Cmd-F"() {
        editor_actions.format(frame_id);
      },
      "Shift-Ctrl-F"() {
        editor_actions.format(frame_id);
      },
      "Shift-Enter"() {
        build();
      },
      "Shift-Alt-Enter"() {
        build(true);
      },
      "Shift-Alt-T"() {
        build(true);
      },
      "Shift-Cmd-T"() {
        build(true);
      },
      "Cmd-T"() {
        build();
      },
      "Alt-T"() {
        build();
      },
    };
    for (const k in actionKeys) {
      const v = actionKeys[k];
      extraKeys[k] = v;
    }
    if (opts.bindings !== "emacs") {
      extraKeys["Ctrl-P"] = () => editor_actions.print(frame_id);
    }
    if (frame_tree_actions.sync != null) {
      extraKeys["Alt-Enter"] = () =>
        frame_tree_actions.sync(frame_id, editor_actions);
      extraKeys["Cmd-Enter"] = () =>
        frame_tree_actions.sync(frame_id, editor_actions);
    }

    if (!opts.read_only && opts.bindings !== "emacs") {
      // emacs bindings really conflict with these
      // Extra codemirror keybindings -- for some of our plugins
      // inspired by http://www.door2windows.com/list-of-all-keyboard-shortcuts-for-sticky-notes-in-windows-7/
      const keybindings = {
        bold: "Cmd-B Ctrl-B",
        italic: "Cmd-I Ctrl-I",
        underline: "Cmd-U Ctrl-U",
        comment: "Shift-Ctrl-3",
        strikethrough: "Shift-Cmd-X Shift-Ctrl-X",
        subscript: "Cmd-= Ctrl-=",
        superscript: "Shift-Cmd-= Shift-Ctrl-=",
      };

      // use a closure to bind cmd.
      const f = (key, cmd) =>
        (extraKeys[key] = (cm) => {
          cm.edit_selection({ cmd });
          return editor_actions.set_syncstring_to_codemirror();
        });

      for (const cmd in keybindings) {
        const keys = keybindings[cmd];
        for (const key of keys.split(" ")) {
          f(key, cmd);
        }
      }
    }
  }
  if (opts.match_xml_tags) {
    extraKeys["Ctrl-J"] = "toMatchingTag";
  }

  if (feature.isMobile.Android()) {
    // see https://github.com/sragemathinc/smc/issues/1360
    opts.style_active_line = false;
  }

  const ext = filename_extension_notilde(filename).toLowerCase();

  // Ugly until https://github.com/sagemathinc/cocalc/issues/2847 is implemented:
  const tab2exts = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "json",
    "md",
    "rmd",
    "r",
    "html",
    "c",
    "c++",
    "cc",
    "cpp",
    "h",
    "bib",
  ];
  if (tab2exts.includes(ext)) {
    opts.tab_size = opts.indent_unit = 2;
  }

  // special case gofmt? yes, the whole go-world use 8-space-tabs instead of normal spaces.
  // we change it to 4 in the editor, though, because 8 is really wide.
  if ("go" === ext) {
    opts.spaces_instead_of_tabs = false;
    opts.tab_size = opts.indent_unit = 4;
  }

  const options: any = {
    spellcheck: opts.spellcheck,
    firstLineNumber: opts.first_line_number,
    autofocus: false,
    mode: { name: opts.mode, globalVars: true },
    lineNumbers: opts.line_numbers,
    showTrailingSpace: opts.show_trailing_whitespace,
    indentUnit: valid_indent(opts.indent_unit),
    tabSize: valid_indent(opts.tab_size),
    smartIndent: opts.smart_indent,
    electricChars: opts.electric_chars,
    undoDepth: opts.undo_depth,
    matchBrackets: opts.match_brackets,
    autoCloseBrackets: opts.auto_close_brackets && !["hs", "lhs"].includes(ext), //972
    autoCloseTags:
      opts.mode.indexOf("xml") !== -1 ||
      opts.mode.indexOf("html") !== -1 ||
      opts.mode.indexOf("cml") !== -1 ||
      opts.mode.indexOf("kml") !== -1
        ? opts.auto_close_xml_tags
        : undefined,
    autoCloseLatex:
      opts.mode.indexOf("tex") !== -1 ? opts.auto_close_latex : undefined,
    leanSymbols: opts.mode.indexOf("lean") !== -1,
    lineWrapping: opts.line_wrapping,
    readOnly: opts.read_only,
    styleActiveLine: opts.style_active_line,
    indentWithTabs: !opts.spaces_instead_of_tabs,
    showCursorWhenSelecting: true,
    extraKeys,
    cursorScrollMargin: 3,
    viewportMargin: 10,
  };

  if (opts.match_xml_tags) {
    options.matchTags = { bothTags: true };
  }

  if (opts.code_folding) {
    extraKeys["Ctrl-Q"] = (cm) => cm.foldCodeSelectionAware();
    extraKeys["Alt-Q"] = (cm) => cm.foldCodeSelectionAware();
    options.foldGutter = true;
    options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"];
  } else {
    options.gutters = ["CodeMirror-linenumbers"];
  }

  if (gutters) {
    for (const gutter_id of gutters) {
      options.gutters.push(gutter_id);
    }
  }

  if (opts.bindings != null && opts.bindings !== "standard") {
    options.keyMap = opts.bindings;
  }

  if (opts.theme != null) {
    options.theme = opts.theme;
  } else {
    // options.theme MUST be set to something because this code is in CodeMirror
    //    cm.options.theme.replace...
    options.theme = "default";
  }

  if (options.spellcheck) {
    // Note -- using contenteditable is NOT without negative consequences. See
    //   https://github.com/sagemathinc/cocalc/issues/4663
    // However, it's worth it for the option of browser spellchecking, and
    // for our main application (chat input) the line number issue doesn't
    // matter since we don't have line numbers there...
    options.inputStyle = "contenteditable";
  }

  return options;
}

var tab_key = function (editor, spaces_instead_of_tabs) {
  if (editor.somethingSelected()) {
    return (CodeMirror as any).commands.defaultTab(editor);
  } else {
    if (spaces_instead_of_tabs) {
      return editor.tab_as_space();
    } else {
      return (CodeMirror as any).commands.defaultTab(editor);
    }
  }
};
