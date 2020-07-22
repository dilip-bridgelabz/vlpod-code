/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "./types";
import { site_license_hook } from "./site-license/hook";

export async function project_action_request_pre_hook(
  db: PostgreSQL,
  action: string,
  project_id: string,
  dbg: Function
): Promise<void> {
  if (action == "start" || action == "restart") {
    dbg("project_action_request_pre_hook -- doing site_license hook");
    await site_license_hook(db, project_id, dbg);
  }
}
