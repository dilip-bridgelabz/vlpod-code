/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";

import { SiteLicensePublicInfo } from "./types";
import { query } from "../frame-editors/generic/client";
import { SCHEMA } from "smc-util/db-schema";
import { copy } from "smc-util/misc2";

// To avoid overfetching, we cache results for *a few seconds*.
const site_license_public_info_cache = new LRU({ maxAge: 1000 * 15 });

export const site_license_public_info = reuseInFlight(async function (
  license_id: string,
  force: boolean = false
): Promise<SiteLicensePublicInfo | undefined> {
  if (!force && site_license_public_info_cache.has(license_id)) {
    const info = site_license_public_info_cache.get(license_id) as
      | SiteLicensePublicInfo
      | undefined;
    return info;
  }
  if (SCHEMA.site_license_public_info.user_query?.get?.fields == null) {
    throw Error("make typescript happy");
  }
  const site_license_public_info = copy(
    SCHEMA.site_license_public_info.user_query.get.fields
  );
  site_license_public_info.id = license_id;
  const q = {
    query: { site_license_public_info },
  };

  const info: SiteLicensePublicInfo | undefined = (await query(q))?.query
    ?.site_license_public_info;
  site_license_public_info_cache.set(license_id, info);
  return info;
});
