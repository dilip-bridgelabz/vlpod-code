/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functions for getting or formatting url's for various backend endpoints
*/

// TODO: seperate front specific code that uses this stuff
// interestingly, removing "window" here triggers a problem
// with the non-standard window.app_base_url attribute
declare const window: any;

export function get_server_url(project_id: string) {
  return `${
    window ? window.app_base_url || "" : ""
  }/${project_id}/raw/.smc/jupyter`;
}

export function get_blob_url(project_id: string, extension: any, sha1: string) {
  return `${get_server_url(project_id)}/blobs/a.${extension}?sha1=${sha1}`;
}

export function get_logo_url(project_id: string, kernel: any) {
  return `${get_server_url(project_id)}/kernelspecs/${kernel}/logo-64x64.png`;
}
