/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
TODO: mark_file basically implements a broken version of lodash.throttle, but
it's sort of complicated to just switch to throttle.  Do so.

*/

import { webapp_client } from "../webapp-client";

const misc = require("smc-util/misc");

const { callback2, once } = require("smc-util/async-utils");

import { Actions } from "../app-framework";

const immutable = require("immutable");

import { FileUseState, FileUseStore } from "./store";
const { sha1 } = require("smc-util/schema").client_db;

const DEFAULT_CHAT_TTL_S = 5;
const DEFAULT_FILE_TTL_S = 45;

export class FileUseActions<T = FileUseState> extends Actions<
  T | FileUseState
> {
  private mark_file_lock: { [key: string]: Date | true } = {};

  _init() {
    this.record_error = this.record_error.bind(this);
    this.mark_all = this.mark_all.bind(this);
    this.mark_file = this.mark_file.bind(this);
    const store = this.get_store();
    store.on("change", () => {
      // Ensure derived immutable state is updated right after clearing
      // the cache; this of course initializes the cache.
      this.setState({ notify_count: store.get_notify_count() });
    });
  }

  private get_store(): FileUseStore {
    const store: FileUseStore | undefined = this.redux.getStore("file_use");
    if (store == null) {
      throw Error("store must be defined before actions!");
    }
    return store;
  }

  record_error(err: any) {
    // Record in the store that an error occured as a result of some action
    // This should get displayed to the user...
    this.setState({
      errors: this.get_store()
        .get_errors()
        .push(
          immutable.Map({ time: webapp_client.server_time(), err: `${err}` })
        ),
    });
  }

  // OPTIMIZATION: This updates and rerenders for each item.
  // TODO: Change to doing it in a batch.
  mark_all(action): void {
    let v: any[];
    if (action === "read") {
      v = this.get_store().get_all_unread();
    } else if (action === "seen") {
      v = this.get_store().get_all_unseen();
    } else {
      this.record_error(`mark_all: unknown action '${action}'`);
      return;
    }
    v.map((x) => {
      if (x != null) this.mark_file(x.project_id, x.path, action, 0, false);
    });
  }

  _set = async (obj) => {
    try {
      if (!webapp_client.is_signed_in()) {
        await once(webapp_client, "signed_in");
      }
      await callback2(webapp_client.query, { query: { file_use: obj } });
    } catch (error) {
      const err = error;
      console.warn("WARNING: mark_file error -- ", err);
    }
  };

  // Mark the action for the given file with the current timestamp (right now).
  async mark_file(
    project_id: string,
    path: string,
    action: string,
    ttl: number | "default" = "default", // ttl in units of ms
    fix_path: boolean = true,
    timestamp: Date | undefined = undefined
  ): Promise<void> {
    if (fix_path) {
      // This changes .foo.txt.sage-chat to foo.txt.
      path = misc.original_path(path);
    }
    //console.log('mark_file', project_id, path, action)
    const account_id = this.redux.getStore("account").get_account_id();
    if (account_id == null) {
      // nothing to do -- non-logged in users shouldn't be marking files
      return;
    }
    const projects = this.redux.getStore("projects");
    if (projects == null) {
      return;
    }
    const project_map = projects.get("project_map");
    if (project_map == null) {
      return;
    }
    const project_is_known = project_map.has(project_id);
    if (!project_is_known) {
      // user is not currently a collaborator on this project,
      // so definitely shouldn't mark file use.
      return;
    }

    if (timestamp == null) {
      timestamp = webapp_client.server_time();
    } else {
      // ensure is a Date object...
      timestamp = new Date(timestamp);
    }

    if (ttl) {
      if (ttl === "default") {
        if (action.slice(0, 4) === "chat") {
          ttl = DEFAULT_CHAT_TTL_S * 1000;
        } else {
          ttl = DEFAULT_FILE_TTL_S * 1000;
        }
      }
      const key: string = `${project_id}-${path}-${action}`;

      if (this.mark_file_lock[key] && timestamp != null) {
        this.mark_file_lock[key] = timestamp;
        return;
      } else {
        // Always set a lock.
        this.mark_file_lock[key] = true;
      }

      setTimeout(() => {
        const ts = this.mark_file_lock[key];
        if (ts && ts !== true) {
          // user changed the file *after* the lock was set, so we
          // mark it a final time.
          this.do_mark_file(account_id, action, project_id, path, ts);
        }
        delete this.mark_file_lock[key];
      }, ttl);
    }
    if (timestamp == null) return;
    await this.do_mark_file(account_id, action, project_id, path, timestamp);
  }

  private async do_mark_file(
    account_id: string,
    action: string,
    project_id: string,
    path: string,
    timestamp: Date
  ): Promise<void> {
    const obj: any = {
      id: sha1(project_id, path),
      project_id,
      path,
      users: { [account_id]: { [action]: timestamp } },
    };
    if (action === "edit" || action === "chat" || action === "chatseen") {
      // Update the overall "last_edited" field for the file; this is used for sorting,
      // and grabbing only recent files from database for file use notifications.
      obj.last_edited = timestamp;
    }
    await this._set(obj);
  }
}
