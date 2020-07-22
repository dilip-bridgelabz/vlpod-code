/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Loading and configuring the codemirror editor

window.CodeMirror = CodeMirror = require("codemirror");

require("codemirror/addon/mode/overlay.js");
require("codemirror/addon/selection/active-line.js");
require("codemirror/addon/comment/comment.js");

require("codemirror/addon/dialog/dialog.js");
require("codemirror/addon/dialog/dialog.css");

require("codemirror/addon/display/placeholder.js");

require("codemirror/addon/search/searchcursor.js");
require("codemirror/addon/search/jump-to-line.js");
require("codemirror/addon/search/matchesonscrollbar.js");

require("codemirror/addon/edit/matchbrackets.js");
require("codemirror/addon/edit/closebrackets.js");
require("codemirror/addon/edit/trailingspace.js");
require("codemirror/addon/edit/continuelist.js");
require("codemirror/addon/edit/matchtags.js");
require("codemirror/addon/edit/closetag.js");
require("codemirror/addon/wrap/hardwrap.js");
require("codemirror/addon/runmode/runmode.js");
require("codemirror/addon/fold/brace-fold.js");
require("codemirror/addon/fold/foldcode.js");
require("codemirror/addon/fold/foldgutter.js");
require("codemirror/addon/fold/foldgutter.css");

require("codemirror/addon/fold/markdown-fold.js");
require("codemirror/addon/fold/comment-fold.js");
require("codemirror/addon/fold/indent-fold.js");
require("codemirror/addon/fold/xml-fold.js");
require("codemirror/addon/hint/anyword-hint.js");
require("codemirror/addon/hint/css-hint.js");
require("codemirror/addon/hint/html-hint.js");
require("codemirror/addon/hint/javascript-hint.js");

require("codemirror/addon/hint/show-hint.js");

require("codemirror/addon/hint/sql-hint.js");
require("codemirror/addon/hint/xml-hint.js");

require("./modes");

// Keyboard bindings
require("codemirror/keymap/vim.js");
require("codemirror/keymap/emacs.js");
require("codemirror/keymap/sublime.js");

// For some reason python-hint.js got removed from codemirror itself
require("./addon/hint/python-hint.js");

require("./addon/smc-search.js");
//require('codemirror/addon/search/search.js')

// CSS
require("codemirror/lib/codemirror.css");
require("codemirror/theme/3024-day.css");
require("codemirror/theme/3024-night.css");
require("codemirror/theme/abcdef.css");
//require('codemirror/theme/ambiance-mobile.css') # doesn't highlight python, confusing
require("codemirror/theme/ambiance.css");
require("codemirror/theme/base16-dark.css");
require("codemirror/theme/base16-light.css");
require("codemirror/theme/bespin.css");
require("codemirror/theme/blackboard.css");
require("codemirror/theme/cobalt.css");
require("codemirror/theme/colorforth.css");
require("codemirror/theme/darcula.css");
require("codemirror/theme/dracula.css");
require("codemirror/theme/duotone-dark.css");
require("codemirror/theme/duotone-light.css");
require("codemirror/theme/eclipse.css");
require("codemirror/theme/elegant.css");
require("codemirror/theme/erlang-dark.css");
require("codemirror/theme/gruvbox-dark.css");
require("codemirror/theme/hopscotch.css");
require("codemirror/theme/icecoder.css");
require("codemirror/theme/idea.css");
require("codemirror/theme/isotope.css");
require("codemirror/theme/lesser-dark.css");
require("codemirror/theme/liquibyte.css");
require("codemirror/theme/lucario.css");
require("codemirror/theme/material.css");
require("codemirror/theme/mbo.css");
require("codemirror/theme/mdn-like.css");
require("codemirror/theme/midnight.css");
require("codemirror/theme/monokai.css");
require("codemirror/theme/neat.css");
require("codemirror/theme/neo.css");
require("codemirror/theme/night.css");
require("codemirror/theme/oceanic-next.css");
require("codemirror/theme/panda-syntax.css");
require("codemirror/theme/paraiso-dark.css");
require("codemirror/theme/paraiso-light.css");
require("codemirror/theme/pastel-on-dark.css");
require("codemirror/theme/railscasts.css");
require("codemirror/theme/rubyblue.css");
require("codemirror/theme/seti.css");
require("codemirror/theme/shadowfox.css");
require("codemirror/theme/solarized.css");
require("codemirror/theme/ssms.css");
require("codemirror/theme/the-matrix.css");
require("codemirror/theme/tomorrow-night-bright.css");
require("codemirror/theme/tomorrow-night-eighties.css");
require("codemirror/theme/ttcn.css");
require("codemirror/theme/twilight.css");
require("codemirror/theme/vibrant-ink.css");
require("codemirror/theme/xq-dark.css");
require("codemirror/theme/xq-light.css");
require("codemirror/theme/yeti.css");
require("codemirror/theme/zenburn.css");

require("./mode/mediawiki/mediawiki.css");

// Have to strengthen this to "fight off" the adverse buggy global
// impact of some of the above themes... (namely idea and darcula
// at time of writing).
require("./addon/show-hint.css");
