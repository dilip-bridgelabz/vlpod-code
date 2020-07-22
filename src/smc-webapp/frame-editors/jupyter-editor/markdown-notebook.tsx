/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame for working with a Jupyter notebook as a single markdown
document, like in RStudio or our RMarkdown editor.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class MarkdownNotebook extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>Jupyter notebook as live markdown document -- {this.props.path}</div>
    );
  }
}
