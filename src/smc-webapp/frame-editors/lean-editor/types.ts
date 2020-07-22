/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface Task {
  desc: string;
  end_pos_col: number;
  end_pos_line: number;
  pos_col: number;
  pos_line: number;
}

export interface Message {
  caption: string;
  end_pos_col: number;
  end_pos_line: number;
  pos_col: number;
  pos_line: number;
  severity: string;
  text: string;
}

export interface Completion {
  text: string;
  type: string;
}
