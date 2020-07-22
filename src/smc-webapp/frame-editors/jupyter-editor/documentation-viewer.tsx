/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for viewing documentation.   For example, this appears and
shows the docstring for a function when you hit shift+tab.

We might also enhance it to provide fulltext search of code?
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class DocumentationViewer extends Component<Props, {}> {
  render(): Rendered {
    return <div>Documentation for something...</div>;
  }
}
