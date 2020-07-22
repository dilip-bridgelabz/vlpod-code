/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Viewing and configuring site licenses
*/

import { DebounceInput } from "react-debounce-input";
import {
  React,
  Rendered,
  Component,
  rtypes,
  rclass,
  TypedMap,
} from "../../app-framework";
import { plural } from "smc-util/misc";
import { ErrorDisplay, Icon, Loading, Space, r_join } from "../../r_misc";
import { ManagerInfo, SiteLicense } from "./types";
import { actions } from "./actions";
import { List, Map, Set } from "immutable";
import { Button, Popconfirm } from "antd";
import { License } from "./license";
import { UserMap } from "../../todo-types";

interface Props {
  view?: boolean; // if true, open for viewing/editing
  error?: string;
  loading?: boolean;
  creating?: boolean;
  site_licenses?: List<TypedMap<SiteLicense>>;
  editing?: Set<string>;
  saving?: Set<string>;
  edits?: Map<string, TypedMap<SiteLicense>>;
  show_projects?: Map<string, "now" | Date>;
  search?: string;
  usage_stats?: Map<string, number>;

  user_map?: UserMap;
  manager_info?: ManagerInfo;
}

class SiteLicenses extends Component<Props> {
  static reduxProps() {
    return {
      "admin-site-licenses": {
        view: rtypes.bool,
        error: rtypes.string,
        loading: rtypes.bool,
        creating: rtypes.bool,
        site_licenses: rtypes.immutable.List,
        editing: rtypes.immutable.Set,
        saving: rtypes.immutable.Set,
        edits: rtypes.immutable.Map,
        show_projects: rtypes.immutable.Set,
        search: rtypes.string,
        usage_stats: rtypes.immutable.Map,
        manager_info: rtypes.immutable.Map,
      },
      users: {
        user_map: rtypes.immutable,
      },
    };
  }

  private render_error(): Rendered {
    if (!this.props.error) return;
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => actions.set_error("")}
      />
    );
  }

  private render_loading(): Rendered {
    if (this.props.loading) {
      return (
        <Loading theme="medium" style={{ float: "right", fontSize: "20pt" }} />
      );
    }
  }

  private render_license(license: TypedMap<SiteLicense>): Rendered {
    const id = license.get("id");
    return (
      <License
        key={id}
        license={license}
        editing={this.props.editing != null && this.props.editing.has(id)}
        saving={this.props.saving != null && this.props.saving.has(id)}
        edits={this.props.edits != null ? this.props.edits.get(id) : undefined}
        show_projects={this.props.show_projects?.get(id)}
        usage_stats={this.props.usage_stats?.get(id)}
        user_map={this.props.user_map}
        manager_info={
          this.props.manager_info?.get("license_id") == id
            ? this.props.manager_info
            : undefined
        }
      />
    );
  }

  private render_main(): void | Rendered[] {
    if (!this.props.view) return;
    if (!this.props.site_licenses) return;
    const v: Rendered[] = [];
    for (const license of this.props.site_licenses) {
      v.push(this.render_license(license));
    }
    return r_join(v, <div style={{ height: "20px" }}></div>);
  }

  private render_header_toggle(): Rendered {
    return (
      <h4
        onClick={() => actions.set_view(!this.props.view)}
        style={{ cursor: "pointer" }}
      >
        <Icon
          style={{ width: "20px" }}
          name={this.props.view ? "caret-down" : "caret-right"}
        />{" "}
        Licenses
      </h4>
    );
  }

  private render_search_button(): Rendered {
    if (!this.props.view) return;
    return (
      <Button
        onClick={() => actions.load()}
        disabled={this.props.loading || !this.props.search}
        style={{ margin: "15px 0" }}
      >
        Search for licenses
      </Button>
    );
  }

  private render_create_new_license(): Rendered {
    if (!this.props.view) return;
    return (
      <Popconfirm
        title={"Are you sure you want to create a new license?"}
        onConfirm={() => actions.create_new_license()}
        okText={"Yes"}
        cancelText={"Cancel"}
      >
        <Button
          disabled={this.props.creating}
          style={{ margin: "15px 0", float: "right" }}
        >
          <Icon name="plus" spin={this.props.creating} />
          <Space /> Create license...
        </Button>
      </Popconfirm>
    );
  }

  private render_search(): Rendered {
    if (!this.props.view) return;
    return (
      <DebounceInput
        placeholder={"Search for licenses..."}
        style={{
          marginLeft: "5px",
          width: "40ex",
          padding: "5px",
          border: "1px solid lightgrey",
          borderRadius: "3px",
        }}
        value={this.props.search ?? ""}
        onChange={(e) => actions.set_search((e.target as any).value)}
        onKeyUp={(e) => {
          if (e.keyCode === 13) {
            actions.load();
          }
        }}
      />
    );
  }

  private render_search_restriction_note(): Rendered {
    if (this.props.site_licenses?.size) {
      return (
        <b style={{ marginLeft: "10px" }}>
          Showing the most recent {this.props.site_licenses.size}{" "}
          {plural(this.props.site_licenses.size, "license")} matching the search{" "}
          <a
            onClick={() => {
              actions.set_search("");
              actions.load();
            }}
          >
            (clear)
          </a>
          .
        </b>
      );
    }
  }

  private render_body(): Rendered {
    if (!this.props.view) return;
    return (
      <div style={{ margin: "0 30px" }}>
        {this.render_error()}
        <div>
          {this.render_search()}
          <Space />
          <Space />
          {this.render_search_button()}
          <Space />
          <Space />
          {this.render_create_new_license()}
          <Space />
          <Space />
          {this.render_search_restriction_note()}
          {this.render_loading()}
        </div>
        {this.render_main()}
      </div>
    );
  }

  render(): Rendered {
    return (
      <div>
        {this.render_header_toggle()}
        {this.render_body()}
      </div>
    );
  }
}

const c = rclass(SiteLicenses);
export { c as SiteLicenses };
