/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// contents of credentials yaml file
export interface Creds {
  readonly sitename: string;
  readonly url: string;
  readonly email: string;
  readonly passw: string;
  readonly project: string;
  readonly token?: string;
  readonly firstname?: string;
  readonly lastname?: string;
  readonly shared_folder?: string;
  readonly shared_file?: string;
}

// command-line options and derived objects
export interface Opts {
  headless?: string;
  screenshot?: string;
  path?: string | boolean;
  csv_log: string;
  skip?: RegExp;
  xprj?: string;
}

export interface InstallOpts {
  install_folder: string;
  create_project: boolean;
  headless?: string;
  path?: string | boolean;
  csv_log: string;
}

export const ExtChromePath: string = "/usr/bin/chromium-browser";

export class PassFail {
  pass: number;
  fail: number;
  skip: number;
  constructor(p: number = 0, f: number = 0, s: number = 0) {
    this.pass = p;
    this.fail = f;
    this.skip = s;
  }
  add(pf: PassFail): PassFail {
    this.pass += pf.pass;
    this.fail += pf.fail;
    this.skip += pf.skip;
    return this;
  }
}

export class TestGetString extends PassFail {
  result: string;
  constructor() {
    super();
    this.result = "NONE";
  }
}

export class TestGetBoolean extends PassFail {
  result: boolean;
  constructor() {
    super();
    this.result = false;
  }
}

export const TestFiles: { [key: string]: string } = {
  texfile: "latex-sample.tex",
  widgetfile: "widgets-sample.ipynb",
  sageipynbfile: "sage-sample.ipynb",
  sagewsfile: "sagews-sample.sagews",
  irfile: "ir-sample.ipynb"
};
