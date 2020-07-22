/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Support for the project's websocket-based request/response API, which is used for handling
various messages related to working with Jupyter.
*/

import { get_existing_kernel } from "./jupyter";
import { get_kernel_data } from "./kernel-data";

export async function handle_request(
  path: string,
  endpoint: string,
  query?: any
): Promise<any> {
  // First handle endpoints that do not depend on a specific kernel.
  switch (endpoint) {
    case "kernels":
      return await get_kernel_data();
  }

  // Now endpoints that do depend on a specific kernel.
  const kernel = get_existing_kernel(path);
  if (kernel == null) {
    if (endpoint == "signal") {
      // It's not a serious problem to try to send a signal to a non-existent kernel.  A no-op
      // is completely reasonable, since you only send signals to kill or interrupt, and a non-existent
      // kernel is already killed or interrupted.  See https://github.com/sagemathinc/cocalc/issues/4420
      return {};
    }
    throw Error(`api endpoint ${endpoint}: no kernel with path '${path}'`);
  }
  switch (endpoint) {
    case "save_ipynb_file":
      return kernel.save_ipynb_file();
    case "signal":
      kernel.signal(query.signal);
      return {};
    case "kernel_info":
      return await kernel.kernel_info();
    case "more_output":
      return kernel.more_output(query.id);
    case "complete":
      return await kernel.complete(get_code_and_cursor_pos(query));
    case "introspect":
      const { code, cursor_pos } = get_code_and_cursor_pos(query);
      let detail_level = 0;
      if (query.level != null) {
        try {
          detail_level = parseInt(query.level);
          if (detail_level < 0) {
            detail_level = 0;
          } else if (detail_level > 1) {
            detail_level = 1;
          }
        } catch (err) {}
      }
      return await kernel.introspect({
        code,
        cursor_pos,
        detail_level,
      });
    case "store":
      const { key, value } = query;
      if (value === undefined) {
        // undefined when getting the value
        return kernel.store.get(key);
      } else if (value === null) {
        // null is used for deleting the value
        kernel.store.delete(key);
        return {};
      } else {
        kernel.store.set(key, value);
        return {};
      }
    case "comm":
      const [msg_id, comm_id, data] = query;
      return kernel.send_comm_message_to_kernel(msg_id, comm_id, data);
    default:
      throw Error(`unknown endpoint "${endpoint}"`);
  }
}

function get_code_and_cursor_pos(
  query: any
): { code: string; cursor_pos: number } {
  const code: string = query.code;
  if (!code) {
    throw Error("must specify code");
  }
  let cursor_pos: number;
  if (query.cursor_pos != null) {
    try {
      cursor_pos = parseInt(query.cursor_pos);
    } catch (error) {
      cursor_pos = code.length;
    }
  } else {
    cursor_pos = code.length;
  }

  return { code, cursor_pos };
}
