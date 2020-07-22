/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
We use JSDom for some rendering...
*/

const t0 = new Date().valueOf();
function log(...args): void {
  console.log(...args);
}

log("loading jsDOM...");
const { JSDOM } = require("jsdom");

log("creating DOM");
const DOM = new JSDOM("<!DOCTYPE html>", { url: "http://localhost" });

log("loading jQuery...");
const jquery = require("jquery")(DOM.window);

const g: any = global as any;
g.BACKEND = true;
g.DOM = DOM;
g.window = DOM.window;
g.document = DOM.window.document;
g.navigator = DOM.window.navigator = { userAgent: "" };

g.DEBUG = false;
g.$ = g.jQuery = DOM.window.$ = jquery;

log("Ensure the global variable window.CodeMirror is defined....");
g.CodeMirror = DOM.window.CodeMirror = require("codemirror");

log("Load extra codemirror support libraries");
require("codemirror/addon/runmode/runmode");
require("smc-webapp/codemirror/modes");
require("smc-webapp/codemirror/custom-modes");

// TODO: add a lot more, but by refactoring the relevant code in smc-webapp and requiring it here...

log(`jsDOM support configured (${(new Date().valueOf() - t0) / 1000} seconds)`);
