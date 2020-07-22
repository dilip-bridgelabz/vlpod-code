/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const path = require("path");
const this_file: string = path.basename(__filename, ".js");
const debuglog = require("util").debuglog("cc-" + this_file);

const puppeteer = require("puppeteer");
import chalk from "chalk";
import { Creds, Opts, PassFail, TestGetBoolean } from "./types";
import { time_log2 } from "./time_log";
import { test_tex } from "./test_tex";
import { test_widget } from "./test_widget";
import { test_sage_ker } from "./test_sage_ker";
import { test_sagews } from "./test_sagews";
import { test_ir } from "./test_ir";
import { test_shared_file } from "./test_shared_file";
import { del_hide_project } from "./del_hide_project";
import { is_admin } from "./gui_is_admin";
import { Page, Browser } from "puppeteer";
import screenshot from "./screenshot";

const LONG_TIMEOUT = 70000; // msec

export const login_tests = async function (creds: Creds, opts: Opts): Promise<PassFail> {
  const pfcounts: PassFail = new PassFail();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog("skipping test: " + this_file);
    pfcounts.skip += 1;
    return pfcounts;
  }
  let browser: Browser | undefined;
  try {
    const tm_launch_browser = process.hrtime.bigint();
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: opts.headless,
      executablePath: opts.path,
      slowMo: 50 // without this sometimes the wrong project is selected
    });

    const page: Page = (await browser!.pages())[0];
    //var Type = require('type-of-is');
    //console.log(Type.string(page));
    const version: string = await page.browser().version();
    debuglog("browser", version);

    await time_log2("launch browser", tm_launch_browser, creds, opts);
    const tm_login = process.hrtime.bigint();
    await page.setDefaultTimeout(LONG_TIMEOUT);

    // use large viewport for .tex test until this issue is fixed:
    // https://github.com/sagemathinc/cocalc/issues/4000
    //await page.setViewport({ width: 1280, height: 1024});
    // workaround for sagews, Run button doesn't show if window is narrower than 1000 px or so
    await page.setViewport({ width: 1024, height: 768 });
    //await page.setViewport({ width: 800, height: 600});

    await page.goto(creds.url);
    debuglog("loaded", creds.url);

    let sel = '*[cocalc-test="sign-in-email"]';
    await page.click(sel);
    await page.keyboard.type(creds.email);
    debuglog("entered email", creds.email);

    sel = '*[cocalc-test="sign-in-password"]';
    await page.click(sel);
    await page.keyboard.type(creds.passw);
    debuglog("entered password");

    sel = '*[cocalc-test="sign-in-submit"]';
    await page.click(sel);
    await time_log2("login with gui", tm_login, creds, opts);

    const tm_open_project = process.hrtime.bigint();
    sel = '*[cocalc-test="project-button"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    await screenshot(page, opts, "cocalc-projects.png");

    // type into the project search blank
    sel = '*[cocalc-test="search-input"][placeholder="Search for projects..."]';
    await page.waitForSelector(sel);
    await page.type(sel, creds.project);

    // find the project link and click it
    let xpt = `//a[@cocalc-test="project-line"][//span/p[text()="${creds.project}"]]`;
    //await page.waitForXPath(xpt, timeout=LONG_TIMEOUT);
    await page.waitForXPath(xpt);
    sel = '*[cocalc-test="project-line"]';
    await page.click(sel);

    xpt = '//button[text()="Check All"]';
    await page.waitForXPath(xpt);
    await time_log2("open project", tm_open_project, creds, opts);
    pfcounts.pass += 1;

    if (opts.xprj) pfcounts.add(await del_hide_project(creds, opts, page));
    if (opts.xprj === undefined || opts.xprj !== "delete") {
      pfcounts.add(await test_tex(creds, opts, page));
      pfcounts.add(await test_ir(creds, opts, page));
      pfcounts.add(await test_widget(creds, opts, page));
      pfcounts.add(await test_sage_ker(creds, opts, page));
      pfcounts.add(await test_sagews(creds, opts, page));
      const tgb: TestGetBoolean = await is_admin(creds, opts, page);
      pfcounts.add(tgb);
      pfcounts.add(await test_shared_file(creds, opts, browser!));
    }

    await time_log2("login session total", tm_launch_browser, creds, opts);
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog("login session done - closing browser");
  if (browser) browser.close();
  return pfcounts;
};
