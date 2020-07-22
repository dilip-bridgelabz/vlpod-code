/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { useConfirmation } from "./state-helpers";
import { Icon } from "../../r_misc";
import { Button, ButtonToolbar, Well } from "../../antd-bootstrap";
import { Card } from "antd";

interface Props {
  delete_all_students: () => void;
}

export function DeleteAllStudents({ delete_all_students }: Props) {
  const [is_opened, confirm, open_confirmation, cancel] = useConfirmation(
    delete_all_students
  );

  return (
    <Card
      title={
        <>
          <Icon name="trash" /> Delete all students
        </>
      }
    >
      <Button bsStyle="warning" onClick={open_confirmation}>
        <Icon name="trash" /> Delete all Students...
      </Button>
      {is_opened && <Confirmation on_confirm={confirm} on_cancel={cancel} />}
      <hr />
      <span style={{ color: "#666" }}>
        Student projects will not be deleted. Also, if you make a mistake,
        students can still be un-deleted from the Student tab.
      </span>
    </Card>
  );
}

function Confirmation({ on_confirm, on_cancel }) {
  return (
    <Well style={{ marginTop: "10px" }}>
      All students will be deleted and upgrades removed from their projects.
      <br />
      Are you absolutely sure?
      <ButtonToolbar style={{ marginTop: "10px" }}>
        <Button bsStyle="warning" onClick={on_confirm}>
          YES, DELETE all Students
        </Button>
        <Button onClick={on_cancel}>Cancel</Button>
      </ButtonToolbar>
    </Well>
  );
}
