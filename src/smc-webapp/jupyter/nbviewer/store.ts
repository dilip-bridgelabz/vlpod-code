/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map } from "immutable";

import { Store } from "../../app-framework";

export interface NBViewerState {
  project_id: string;
  path: string;
  font_size: number;
  error?: string;
  loading?: Date;
  cells?: Map<string, any>;
  cell_list: List<string>;
  cm_options: Map<string, any>;
}

export class NBViewerStore extends Store<NBViewerState> {}
