/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
const { Col, Row } = require("react-bootstrap");

interface Props {
  label_cols?: number;
  label?: string | React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

export function LabeledRow({
  children,
  style,
  label,
  className,
  label_cols = 4,
}: Props) {
  return (
    <Row style={style} className={className}>
      <Col xs={label_cols} style={{ marginTop: "8px" }}>
        {label}
      </Col>
      <Col xs={12 - label_cols} style={{ marginTop: "8px" }}>
        {children}
      </Col>
    </Row>
  );
}
