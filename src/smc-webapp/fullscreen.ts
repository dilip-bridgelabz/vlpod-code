/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* enable fullscreen mode upon a URL like /app?fullscreen and additionally
   kiosk-mode upon /app?fullscreen=kiosk
*/

import { QueryParams } from "./misc/query-params";

import "./misc/window-globals";

export const COCALC_FULLSCREEN = QueryParams.get("fullscreen");
export const COCALC_MINIMAL = COCALC_FULLSCREEN === "kiosk";
if (COCALC_MINIMAL) {
  console.log("CoCalc Kiosk Mode");
}
