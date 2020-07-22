/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a single PDF page using canvas.
*/

import * as $ from "jquery";

import { PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";

import { Component, React, ReactDOM } from "../../app-framework";

import { AnnotationLayer, SyncHighlight } from "./pdfjs-annotation";

interface Props {
  page: PDFPageProxy;
  scale: number;
  click_annotation: Function;
  sync_highlight?: SyncHighlight;
}

export class CanvasPage extends Component<Props, {}> {
  async render_page(page: PDFPageProxy, scale: number): Promise<void> {
    const div: HTMLElement = ReactDOM.findDOMNode(this.refs.page);
    const viewport: PDFPageViewport = page.getViewport({
      scale: scale * window.devicePixelRatio,
    });
    const canvas: HTMLCanvasElement = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx == null) {
      console.error(
        "pdf.js -- unable to get a 2d canvas, so not rendering page"
      );
      return;
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
    canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;
    $(div).empty();
    div.appendChild(canvas);
    try {
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;
    } catch (err) {
      console.error(`pdf.js -- Error rendering canvas page: ${err}`);
      return;
    }
  }

  componentWillReceiveProps(next_props: Props): void {
    this.render_page(next_props.page, next_props.scale);
  }

  componentDidMount(): void {
    this.render_page(this.props.page, this.props.scale);
  }

  render() {
    return (
      <div
        style={{
          margin: "auto",
          position: "relative",
          display: "inline-block",
        }}
      >
        <AnnotationLayer
          page={this.props.page}
          scale={this.props.scale}
          click_annotation={this.props.click_annotation}
          sync_highlight={this.props.sync_highlight}
        />
        <div ref="page" />
      </div>
    );
  }
}
