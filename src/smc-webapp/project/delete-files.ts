/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { webapp_client } from "../webapp-client";

// Delete the files/directories in the given project with the given list of paths.
export async function delete_files(
  project_id: string,
  paths: string[]
): Promise<void> {
  // Get project api
  const api = await webapp_client.project_client.api(project_id);
  // Send message requesting to delete the files
  await api.delete_files(paths);
}
