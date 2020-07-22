/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../../app-framework";

export function account_id_to_username(
  account_id: string,
  project_id: string
): string {
  if (account_id == project_id) return "The Project";
  const users = redux.getStore("users");
  if (users == null) return "Unknown";
  const name = users.get_name(account_id);
  if (name == null) return "Unknown";
  return name;
}
