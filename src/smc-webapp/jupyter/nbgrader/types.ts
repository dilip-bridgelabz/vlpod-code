/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// See https://nbgrader.readthedocs.io/en/stable/contributor_guide/metadata.html
// ... which is out of date as I make the most recent change...

import { Map } from "immutable";

export interface Metadata {
  grade?: boolean;
  grade_id?: string;
  locked?: boolean;
  schema_version?: number;
  solution?: boolean;
  task?: boolean;
  points?: number;
}

export type ImmutableMetadata = Map<string, any>;
