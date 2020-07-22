/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Router for public share server.
*/

import "./jsdom-support";

import * as os_path from "path";
import { callback } from "awaiting";
import * as express from "express";
import { get_public_paths, PublicPaths } from "./public-paths";
import { AuthorInfo } from "./authors";
import { SettingsDAO } from "./settings";

import { handle_share_css } from "./handle-share-css";
import { handle_share_listing } from "./handle-share-listing";
import { handle_user_request } from "./handle-user-request";
import { handle_path_request } from "./handle-path-request";

import * as util from "./util";

import { Database, Logger } from "./types";
import { PostgreSQL } from "../postgres/types";

export function share_router(opts: {
  database: Database;
  path: string;
  logger?: Logger;
  base_url?: string;
}) {
  let dbg;

  const author_info: AuthorInfo = new AuthorInfo(opts.database);
  const settings_dao: SettingsDAO = new SettingsDAO(
    (opts.database as any) as PostgreSQL
  );

  const base_url: string = opts.base_url != null ? opts.base_url : "";

  if ((global as any).window != null) {
    (global as any).window["app_base_url"] = base_url;
  }

  if (opts.logger != null) {
    const logger = opts.logger;
    dbg = (...args) => logger.debug("share_router: ", ...args);
  } else {
    dbg = (..._args) => {};
  }

  dbg("base_url = ", base_url);
  dbg("path = ", opts.path);

  function log_ip(req): void {
    const ip_addresses =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    dbg(`remote='${ip_addresses}' requests url='${req.url}'`);
  }

  if (opts.path.indexOf("[project_id]") === -1) {
    // VERY BAD situation
    throw Error(`opts.path (='${opts.path}')must contain '[project_id]'`);
  }
  function path_to_files(project_id: string): string {
    return util.path_to_files(opts.path, project_id);
  }

  let ready_queue: Function[] = [];
  dbg("getting_public_paths");
  let public_paths: PublicPaths;
  async function init_public_paths(): Promise<void> {
    try {
      public_paths = await get_public_paths(opts.database);
    } catch (err) {
      // This is fatal and should be impossible...
      dbg("get_public_paths - ERROR", err);
      return;
    }
    dbg("got_public_paths - initialized");
    const v = ready_queue;
    ready_queue = [];
    for (const cb of v) {
      cb();
    }
  }
  // do not await since we want all the code below to run first.
  init_public_paths();

  async function ready(): Promise<void> {
    if (public_paths != null) return;
    // wait until public_paths is ready.
    await callback((cb) => ready_queue.push(cb));
  }

  if (process.env.SMC_ROOT == null) {
    throw Error("process.env.SMC_ROOT must be defined");
  }
  const router = express.Router();
  for (const name of ["favicon-32x32.png", "cocalc-icon.svg"]) {
    router.use(
      `/${name}`,
      express.static(os_path.join(process.env.SMC_ROOT, `webapp-lib/${name}`), {
        immutable: true,
        maxAge: 86000000,
      })
    );
  }

  // TODO: serve from static file when/if it gets at all big; or from some refactor
  // of our existing css.  That said, our aim for the share server is extreme cleanliness
  // and simplicity, so what we want may be different from cocalc interactive.
  router.get("/share.css", handle_share_css);

  router.get("/", async (req, res) => {
    log_ip(req);
    await ready();
    handle_share_listing({ public_paths, base_url, settings_dao, req, res });
  });

  router.get("/users/:account_id", async (req, res) => {
    log_ip(req);
    await ready();
    handle_user_request({
      public_paths,
      author_info,
      settings_dao,
      req,
      res,
      base_url,
    });
  });

  // Always use raw under the /raw URL.
  router.get("/raw/:id/*?", async (req, res) => {
    log_ip(req);
    await ready();
    handle_path_request({
      author_info,
      settings_dao,
      public_paths,
      req,
      res,
      viewer: "raw",
      path_to_files,
      base_url,
    });
  });

  router.get("/:id/*?", async (req, res) => {
    log_ip(req);
    await ready();
    handle_path_request({
      author_info,
      settings_dao,
      public_paths,
      req,
      res,
      path_to_files,
      base_url,
    });
  });

  router.get("*", (req, res) => res.send(`unknown path='${req.path}'`));

  return router;
}
