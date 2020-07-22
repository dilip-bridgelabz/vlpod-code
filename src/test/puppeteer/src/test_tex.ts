/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

import chalk from "chalk";
import { Creds, Opts, PassFail, TestFiles } from "./types";
import { time_log2 } from "./time_log";
import screenshot from "./screenshot";
import { Page } from "puppeteer";

import { expect } from "chai";

export const test_tex = async function (creds: Creds, opts: Opts, page: Page): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  try {
    const tm_open_tex = process.hrtime.bigint();

    // click the Files button
    let sel = '*[cocalc-test="Files"]';
    await page.click(sel);
    debuglog("clicked Files");

    sel = '*[cocalc-test="search-input"][placeholder="Search or create file"]';
    await page.click(sel);
    await page.type(sel, TestFiles.texfile);
    debuglog(`entered ${TestFiles.texfile} into file search`);

    // find and click the texfile link
    // split texfile name into base and ext because they appear in separate spans
    const z = TestFiles.texfile.lastIndexOf(".");
    const tfbase = TestFiles.texfile.slice(0, z);
    const tfext = TestFiles.texfile.slice(z);

    let xpt = `//a[@cocalc-test="file-line"][//span[text()="${tfbase}"]][//span[text()="${tfext}"]]`;
    //await page.waitForXPath(xpt, {timeout: 50000});
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="file-line"]';
    await page.click(sel);
    debuglog("clicked file line");

    await time_log2("open tex file", tm_open_tex, creds, opts);
    const tm_word_count = process.hrtime.bigint();

    sel = '*[cocalc-test="short-Source"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog("clicked latex Source");

    sel = '[cocalc-test="word_count"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    debuglog("clicked word count");

    xpt = '//div[contains(text(), "Encoding: ascii")]';
    await page.waitForXPath(xpt);
    debuglog("got encoding ascii");

    sel = '*[cocalc-test="word-count-output"]';
    await page.waitForSelector(sel);

    const text: string = await page.$eval(sel, function (e) {
      return (<HTMLElement>e).innerText.toString();
    });
    const want: string = "Words in headers: 3";
    debuglog("word count output:\n" + chalk.cyan(text));
    expect(text, "missing text in word count output").to.include(want);

    sel = '*[cocalc-test="short-Word Count"]';
    await page.click(sel);
    debuglog("clicked word count again");

    sel = '*[cocalc-test="cm"]';
    await page.click(sel);
    debuglog("clicked source code");

    sel = '*[title="Build project"]';
    await page.waitForSelector(sel);
    debuglog("got Build project button");

    sel = `[cocalc-test="${TestFiles.texfile}"] [data-icon="times"]`;
    //await page.waitForSelector(sel);
    await page.click(sel);
    debuglog("clicked close file tab icon");

    await time_log2("word count tex file", tm_word_count, creds, opts);
    await screenshot(page, opts, "cocalc-tex.png");
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  return pfcounts;
};
