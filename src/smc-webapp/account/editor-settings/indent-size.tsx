/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { LabeledRow, NumberInput } from "../../r_misc";

interface Props {
  tab_size: number;
  on_change: (name: string, value: number) => void;
}

export function EditorSettingsIndentSize(props: Props): JSX.Element {
  return (
    <LabeledRow label="Indent size">
      <NumberInput
        on_change={(n) => props.on_change("tab_size", n)}
        min={2}
        max={32}
        number={props.tab_size}
      />
    </LabeledRow>
  );
}
