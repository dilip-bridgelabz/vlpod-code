/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

Table({
  name: "lti",
  fields: {
    iss: {
      type: "string",
      desc: "uniquely determines the LTI provider",
    },
    name: {
      type: "string",
      desc: "displayed name (internally)",
    },
    config: {
      type: "map",
      desc: "extra information related to LTI",
    },
  },
  rules: {
    desc: "LTI Providers",
    anonymous: false,
    primary_key: "iss",
    pg_indexes: [],
    user_query: {
      get: {
        admin: true,
        fields: {
          iss: null,
          name: null,
          config: null,
        },
      },
      set: {
        admin: true,
        fields: {
          iss: null,
          name: null,
          config: null,
        },
      },
    },
  },
});
