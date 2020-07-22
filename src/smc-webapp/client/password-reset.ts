/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { QueryParams } from "../misc/query-params";

export function reset_password_key() {
  // some mail transport agents will uppercase the URL -- see https://github.com/sagemathinc/cocalc/issues/294
  const forgot = QueryParams.get("forgot");
  if (forgot && typeof forgot == "string") {
    return forgot.toLowerCase();
  }
  return undefined;
}
