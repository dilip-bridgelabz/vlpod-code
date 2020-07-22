/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { EventEmitter } from "events";

import { callback, delay } from "awaiting";

type State = "closed" | "disconnected" | "connecting" | "connected";

export class Changefeed extends EventEmitter {
  private query: any;
  private do_query: Function;
  private query_cancel: Function;
  private state: State = "disconnected";
  private table: string;
  private id: string;
  private options: any;
  private handle_update_queue: { err?: any; resp?: any }[] = [];

  constructor({
    do_query,
    query_cancel,
    options,
    query,
    table,
  }: {
    do_query: Function;
    query_cancel: Function;
    options: any;
    table: string;
    query: any;
  }) {
    super();
    this.do_query = do_query;
    this.query_cancel = query_cancel;
    this.query = query;
    this.options = options;
    this.table = table;
  }

  // Query for state of the table, connects to the
  // changefeed, and return the initial state
  // of the table.  Throws an exception if anything
  // goes wrong.
  public async connect(): Promise<any> {
    if (this.state != "disconnected") {
      throw Error(
        `can only connect if state is 'disconnected' but it is ${this.state}`
      );
    }
    this.state = "connecting";
    const resp = await callback(this.run_the_query.bind(this));
    if (this.state === ("closed" as State)) {
      throw Error("after running query, changefeed state is 'closed'");
    }
    if (resp.event === "query_cancel") {
      throw Error("query-cancel");
    }
    if (resp.query == null || resp.query[this.table] == null) {
      throw Error(`${this.table} changefeed init -- no error and no data`);
    }
    // Successfully completed query
    this.id = resp.id;
    this.state = "connected";
    this.process_queue_next_tick();
    return resp.query[this.table];
  }

  // Wait a tick, then process the queue of messages that
  // arrived during initialization.
  private async process_queue_next_tick(): Promise<void> {
    await delay(0);
    while (this.state != "closed" && this.handle_update_queue.length > 0) {
      const x = this.handle_update_queue.shift();
      if (x != null) {
        this.handle_update(x.err, x.resp);
      }
    }
  }

  private run_the_query(cb: Function): void {
    // This query_function gets called first on the
    // initial query, then repeatedly with each changefeed
    // update. The input function "cb" will be called
    // precisely once, and the method handle_changefeed_update
    // may get called if there are additional
    // changefeed updates.
    let first_time: boolean = true;
    this.do_query({
      query: this.query,
      changes: true,
      timeout: 30,
      options: this.options,
      cb: (err, resp) => {
        if (first_time) {
          cb(err, resp);
          first_time = false;
        } else {
          this.handle_update(err, resp);
        }
      },
    });
  }

  private handle_update(err, resp): void {
    if (this.state != "connected") {
      if (this.state == "closed") {
        // expected, since last updates after query cancel may get through...
        return;
      }
      // This can and does happen when updates appear immediately
      // after the first initial state is set (in run_the_query).
      this.handle_update_queue.push({ err, resp });
      return;
    }
    if (resp == null && err == null) {
      err = "resp must not be null for non-error";
    }
    if (err || resp.event === "query_cancel") {
      //if (err) console.warn("closing changefeed due to err", err);
      this.close();
      return;
    }
    if (resp.action == null) {
      // Not a changefeed message.  This happens, e.g., the first time
      // when we use the standby server to get the changefeed.
      return;
    }
    // Return just the new_val/old_val/action part of resp.
    // console.log("resp=", resp);
    const x: { new_val?: any; old_val?: any; action?: string } = {};
    if (resp.new_val) {
      x.new_val = resp.new_val;
    }
    if (resp.old_val) {
      x.old_val = resp.old_val;
    }
    x.action = resp.action;
    this.emit("update", x);
  }

  public close(): void {
    this.state = "closed";
    delete this.handle_update_queue;
    if (this.id != null) {
      // stop listening for future updates
      this.cancel_query(this.id);
      delete this.id;
    }
    this.emit("close");
    this.removeAllListeners();
  }

  private async cancel_query(id: string): Promise<void> {
    try {
      await this.query_cancel(id);
    } catch (err) {
      // ignore error, which might be due to disconnecting and isn't a big deal.
      // Basically anything that could cause an error would have also
      // cancelled the changefeed anyways.
    }
  }

  public get_state(): string {
    return this.state;
  }
}

//
