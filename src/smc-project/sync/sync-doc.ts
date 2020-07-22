/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Backend project support for using syncdocs.

This is mainly responsible for:

- loading and saving files to disk
- executing code

*/

import { SyncTable } from "../smc-util/sync/table";
import { SyncDB } from "../smc-util/sync/editor/db/sync";
import { SyncString } from "../smc-util/sync/editor/string/sync";
import { SyncDoc } from "../smc-util/sync/editor/generic/sync-doc";
import { Client } from "../smc-util/sync/editor/generic/types";
import { once } from "../smc-util/async-utils";
import { filename_extension } from "../smc-util/misc2";
import { jupyter_backend } from "../jupyter/jupyter";

const COCALC_EPHEMERAL_STATE: boolean =
  process.env.COCALC_EPHEMERAL_STATE === "yes";

const syncdocs: { [path: string]: SyncDoc } = {};

export function init_syncdoc(
  client: Client,
  synctable: SyncTable,
  logger: any
): void {
  if (synctable.get_table() !== "syncstrings") {
    throw Error("table must be 'syncstrings'");
  }
  if (synctable.get_state() == "closed") {
    throw Error("synctable must not be closed");
  }
  // It's the right type of table and not closed.  Now do
  // the real setup work (without blocking).
  init_syncdoc_async(client, synctable, logger);
}

// If there is an already existing syncdoc for this path,
// return it; otherwise, return undefined.  This is useful
// for getting a reference to a syncdoc, e.g., for prettier.
export function get_syncdoc(path: string): SyncDoc | undefined {
  return syncdocs[path];
}

async function close_syncdoc(path: string): Promise<void> {
  const doc = get_syncdoc(path);
  if (doc == null) return;
  delete syncdocs[path];
  await doc.close();
}

async function init_syncdoc_async(
  client: Client,
  synctable: SyncTable,
  logger: any
): Promise<void> {
  function log(...args): void {
    logger.debug("init_syncdoc -- ", ...args);
  }

  log("waiting until synctable is ready");
  await wait_until_synctable_ready(synctable, log);
  log("synctable ready.  Now getting type and opts");
  const { type, opts } = get_type_and_opts(synctable);
  opts.project_id = client.client_id();
  log("type = ", type);
  log("opts = ", JSON.stringify(opts));
  opts.client = client;
  log("now creating syncdoc...");
  let syncdoc;
  try {
    syncdoc = create_syncdoc(type, opts);
    syncdocs[opts.path] = syncdoc;
  } catch (err) {
    log(`ERROR creating syncdoc -- ${err.toString()}`, err.stack);
    // TODO: how to properly inform clients and deal with this?!
    return;
  }
  synctable.on("closed", function () {
    log("syncstring table closed, so closing syncdoc", opts.path);
    close_syncdoc(opts.path);
  });

  syncdoc.on("error", function (err) {
    log(`syncdoc error -- ${err}`);
    close_syncdoc(opts.path);
  });

  // Extra backend support in some cases, e.g., Jupyter, Sage, etc.
  const ext = filename_extension(opts.path);
  log("ext = ", ext);
  switch (ext) {
    case "sage-jupyter2":
      log("activating jupyter backend");
      jupyter_backend(syncdoc, client);
      break;
  }
}

async function wait_until_synctable_ready(
  synctable: SyncTable,
  log: Function
): Promise<void> {
  if (synctable.get_state() == "disconnected") {
    log("wait for synctable be connected");
    await once(synctable, "connected");
  }

  const t = synctable.get_one();
  if (t != null) {
    log("currently", t.toJS());
  }
  log("wait for document info to get loaded into synctable...");
  // Next wait until there's a document in the synctable, since that will
  // have the path, patch type, etc. in it.  That is set by the frontend.
  function is_ready(): boolean {
    const t = synctable.get_one();
    if (t == null) {
      log("is_ready: table is null still");
      return false;
    } else {
      log("is_ready", JSON.stringify(t));
      return t.has("path");
    }
  }
  await synctable.wait(is_ready, 0);
  log("document info is now in synctable");
}

function get_type_and_opts(synctable: SyncTable): { type: string; opts: any } {
  const s = synctable.get_one();
  if (s == null) {
    throw Error("synctable must not be empty");
  }
  const path = s.get("path");
  if (typeof path != "string") {
    throw Error("path must be a string");
  }
  const opts = { path, ephemeral: COCALC_EPHEMERAL_STATE };
  let type: string = "";

  let doctype = s.get("doctype");
  if (doctype != null) {
    try {
      doctype = JSON.parse(doctype);
    } catch {
      doctype = {};
    }
    if (doctype.opts != null) {
      for (const k in doctype.opts) {
        opts[k] = doctype.opts[k];
      }
    }
    type = doctype.type;
  }
  if (type !== "db" && type !== "string") {
    // fallback type
    type = "string";
  }
  return { type, opts };
}

function create_syncdoc(type, opts): SyncDoc {
  switch (type) {
    case "string":
      return new SyncString(opts);
    case "db":
      return new SyncDB(opts);
    default:
      throw Error(`unknown syncdoc type ${type}`);
  }
}

export async function syncdoc_call(
  path: string,
  logger: any,
  mesg: any
): Promise<string> {
  logger.debug("syncdoc_call", path, mesg);
  const doc = get_syncdoc(path);
  if (doc == null) {
    logger.debug("syncdoc_call -- not open: ", path);
    return "not open";
  }
  switch (mesg.cmd) {
    case "close":
      logger.debug("syncdoc_call -- now closing: ", path);
      await close_syncdoc(path);
      logger.debug("syncdoc_call -- closed: ", path);
      return "successfully closed";
    default:
      throw Error(`unknown command ${mesg.cmd}`);
  }
}

// This is used when deleting a file/directory
// filename may be a directory or actual filename
export async function close_all_syncdocs_in_tree(
  filename: string
): Promise<void> {
  for (const path in syncdocs) {
    if (path == filename || path.indexOf(filename + "/") != -1) {
      await close_syncdoc(path);
    }
  }
}
