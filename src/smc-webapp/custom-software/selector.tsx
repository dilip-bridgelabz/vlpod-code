/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, Rendered } from "../app-framework";
import { ComputeImages, ComputeImage, ComputeImageTypes } from "./init";
const { SiteName, CompanyName, HelpEmailLink } = require("../customize");
import { Markdown, SearchInput, Icon } from "../r_misc";
import { CUSTOM_SOFTWARE_HELP_URL } from "./util";

const BINDER_URL = "https://mybinder.readthedocs.io/en/latest/";

const official: ComputeImageTypes = "official";
const custom: ComputeImageTypes = "custom";

const COLORS = require("smc-util/theme").COLORS;

const {
  Row,
  Col,
  FormGroup,
  ControlLabel,
  ListGroup,
  ListGroupItem,
  Radio,
} = require("react-bootstrap");

interface CSProps {
  images?: ComputeImages;
  // this should be Partial<State> ?
  setParentState: (obj : {image_selected?:string; title_text?:string; image_type?: ComputeImageTypes}) => void;
  image_type: ComputeImageTypes;
  image_selected?: string;
  // toggles form true → false after first edit
  title_prefill: boolean;
}

interface CSState {
  search_img: string;
}

const CS_INIT_STATE: Readonly<CSState> = Object.freeze({
  search_img: "",
});

const cs_list_style: Readonly<React.CSSProperties> = Object.freeze({
  height: "250px",
  overflowX: "hidden" as "hidden",
  overflowY: "scroll" as "scroll",
  border: `1px solid ${COLORS.GRAY_LL}`,
  borderRadius: "5px",
  marginBottom: "0px",
});

const entries_item_style: Readonly<React.CSSProperties> = Object.freeze({
  width: "100%",
  margin: "2px 0px",
  padding: "5px",
  border: "none",
  textAlign: "left" as "left",
});

export class CustomSoftware extends Component<CSProps, CSState> {
  constructor(props) {
    super(props);
    this.state = Object.assign({}, CS_INIT_STATE);
  }

  select_image = (id: string, display: string) => {
    this.props.setParentState({ image_selected: id });
    // always overwrite the text, until the user edits it once
    if (this.props.title_prefill) {
      // keep title_prefill as it is
      this.props.setParentState({ title_text: display });
    }
  };

  render_custom_image_entries() {
    if (this.props.images == null) return;

    const search_hit = (() => {
      if (this.state.search_img.length > 0) {
        return (img: ComputeImage) =>
          img
            .get("search_str", "")
            .indexOf(this.state.search_img.toLowerCase()) >= 0;
      } else {
        return (_img: ComputeImage) => true;
      }
    })();

    const entries: Rendered[] = this.props.images
      .filter((img) => img.get("type", "") === custom)
      .filter(search_hit)
      .sortBy((img) => img.get("display", "").toLowerCase())
      .entrySeq()
      .map((e) => {
        const [id, img] = e;
        const display = img.get("display", "");
        return (
          <ListGroupItem
            key={id}
            active={this.props.image_selected === id}
            onClick={() => this.select_image(id, display)}
            style={entries_item_style}
            bsSize={"small"}
          >
            {display}
          </ListGroupItem>
        );
      })
      .toArray();

    if (entries.length > 0) {
      return <ListGroup style={cs_list_style}>{entries}</ListGroup>;
    } else {
      if (this.state.search_img.length > 0) {
        return <div>No search hits.</div>;
      } else {
        return <div>No custom software available</div>;
      }
    }
  }

  search = (val: string) => {
    this.setState({ search_img: val });
    this.props.setParentState({ image_selected: undefined });
  };

  render_custom_images() {
    if (this.props.image_type !== custom) return;

    return (
      <>
        <div style={{ display: "flex" }}>
          <SearchInput
            placeholder={"Search…"}
            autoFocus={false}
            value={this.state.search_img}
            on_escape={() => this.setState({ search_img: "" })}
            on_change={(val) => this.search(val)}
            style={{ flex: "1" }}
          />
        </div>
        {this.render_custom_image_entries()}
        <div style={{ color: COLORS.GRAY, margin: "15px 0" }}>
          Contact us to add more or give feedback:{" "}
          <HelpEmailLink color={COLORS.GRAY} />.
        </div>
      </>
    );
  }

  render_selected_custom_image_info() {
    if (
      this.props.image_type !== custom ||
      this.props.image_selected == null ||
      this.props.images == null
    ) {
      return;
    }

    const id: string = this.props.image_selected;
    const data = this.props.images.get(id);
    if (data == null) {
      // we have a serious problem
      console.warn(`compute_image data missing for '${id}'`);
      return;
    }
    // some fields are derived in the "Table" when the data comes in
    const img: ComputeImage = data;
    const disp = img.get("display");
    const desc = img.get("desc", "");
    const url = img.get("url");
    const src = img.get("src");
    const disp_tag = img.get("display_tag");

    const render_source = () => {
      if (src == null || src.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          Source: <code>{src}</code>
        </div>
      );
    };

    const render_url = () => {
      if (url == null || url.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          <a href={url} target={"_blank"} rel={"noopener"}>
            <Icon name="external-link-alt" /> Website
          </a>
        </div>
      );
    };

    return (
      <>
        <h3 style={{ marginTop: "5px" }}>{disp}</h3>
        <div style={{ marginTop: "5px" }}>
          Image ID: <code>{disp_tag}</code>
        </div>
        <div
          style={{ marginTop: "10px", overflowY: "auto", maxHeight: "200px" }}
        >
          <Markdown value={desc} className={"cc-custom-image-desc"} />
        </div>
        {render_source()}
        {render_url()}
      </>
    );
  }

  render_type_selection() {
    return (
      <>
        <ControlLabel>Software environment</ControlLabel>

        <FormGroup>
          <Radio
            checked={this.props.image_type === official}
            id={"default-compute-image"}
            onChange={() => this.props.setParentState({ image_type: official })}
          >
            <b>Default</b>: large repository of software, maintained by{" "}
            <CompanyName />, running <SiteName />.{" "}
            <a
              href={`${window.app_base_url}/doc/software.html`}
              target={"_blank"}
              rel={"noopener"}
            >
              More info...
            </a>
          </Radio>

          {this.props.images != null && this.props.images.size > 0 ? (
            <Radio
              checked={this.props.image_type === custom}
              label={"Custom software environment"}
              id={"custom-compute-image"}
              onChange={() => this.props.setParentState({ image_type: custom })}
            >
              <b>Custom</b>
              <sup>
                <em>beta</em>
              </sup>
              : 3rd party software environments, e.g.{" "}
              <a href={BINDER_URL} target={"_blank"} rel={"noopener"}>
                Binder
              </a>
              .{" "}
              <a href={CUSTOM_SOFTWARE_HELP_URL} target={"_blank"}>
                More info...
              </a>
            </Radio>
          ) : (
            "There are no customized software environments available."
          )}
        </FormGroup>
      </>
    );
  }

  render() {
    return (
      <Row>
        <Col sm={12} style={{ marginTop: "10px" }}>
          {this.render_type_selection()}
        </Col>

        <Col sm={6}>{this.render_custom_images()}</Col>
        <Col sm={6}>{this.render_selected_custom_image_info()}</Col>
      </Row>
    );
  }
}
