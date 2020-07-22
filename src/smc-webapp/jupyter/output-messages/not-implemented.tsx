/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { STDERR_STYLE } from "./style";

interface NotImplementedProps {
  message: Map<string, any>;
}

export class NotImplemented extends Component<NotImplementedProps> {
  shouldComponentUpdate(nextProps: NotImplementedProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render() {
    return (
      <pre style={STDERR_STYLE}>
        {JSON.stringify(this.props.message.toJS())}
      </pre>
    );
  }
}
