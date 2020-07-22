/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is some slightly complicated code to avoid needless duplication.

It's a bit more complicated than you might expect partly due to the fact
we have to insert these course tab components as frame in a frame tree,
so there is no commoon containing react component that we control...
*/

import {
  React,
  Component,
  Rendered,
  rclass,
  redux,
  rtypes,
  AppRedux,
} from "../../app-framework";
import { Loading, ActivityDisplay, ErrorDisplay } from "../../r_misc";

import {
  AssignmentsMap,
  CourseSettingsRecord,
  StudentsMap,
  HandoutsMap,
} from "../../course/store";
import { Map } from "immutable";
import { ProjectMap, UserMap } from "../../todo-types";
import { CourseActions, course_redux_name } from "./course-actions";
import { merge } from "smc-util/misc2";
import { values } from "smc-util/misc";
import { CourseTabBar } from "./course-tab-bar";
import { CourseEditorActions } from "./actions";
import { CourseStore } from "../../course/store";
import { PayBanner } from "../../course/pay-banner";

export interface FrameProps {
  id: string;
  name: string;
  project_id: string;
  path: string;
  font_size: number;
  course_panel: any; // TODO...
  actions: CourseEditorActions;
  desc: Map<string, any>;
}

interface ReduxProps {
  students?: StudentsMap;
  user_map?: UserMap;
  project_map?: ProjectMap;
  assignments?: AssignmentsMap;
  handouts?: HandoutsMap;
  settings?: CourseSettingsRecord;
  configuring_projects?: boolean;
  activity?: Map<string, any>;
  error?: string;
}

export interface PanelProps {
  name: string;
  frame_id: string;
  project_id: string;
  path: string;
  students: StudentsMap;
  user_map: UserMap;
  project_map: ProjectMap;
  assignments: AssignmentsMap;
  handouts: HandoutsMap;
  settings: CourseSettingsRecord;
  redux: AppRedux;
  actions: CourseActions;
  configuring_projects?: boolean;
}

class CoursePanelWrapper extends Component<FrameProps & ReduxProps> {
  static reduxProps = ({ project_id, path }) => {
    const name = course_redux_name(project_id, path);
    return {
      [name]: {
        students: rtypes.immutable.Map,
        assignments: rtypes.immutable.Map,
        handouts: rtypes.immutable.Map,
        settings: rtypes.immutable.Map,
        configuring_projects: rtypes.bool,
        error: rtypes.string,
        activity: rtypes.immutable.Map,
      },
      users: {
        user_map: rtypes.immutable,
      },
      projects: {
        project_map: rtypes.immutable,
      },
    };
  };

  private render_panel(): Rendered {
    if (
      this.props.students == null ||
      this.props.user_map == null ||
      this.props.project_map == null ||
      this.props.assignments == null ||
      this.props.handouts == null ||
      this.props.settings == null
    ) {
      return <Loading theme={"medium"} />;
    }

    const name = course_redux_name(this.props.project_id, this.props.path);

    const props: PanelProps = {
      frame_id: this.props.id,
      name,
      project_id: this.props.project_id,
      path: this.props.path,
      students: this.props.students,
      user_map: this.props.user_map,
      project_map: this.props.project_map,
      assignments: this.props.assignments,
      handouts: this.props.handouts,
      configuring_projects: this.props.configuring_projects,
      settings: this.props.settings,
      redux,
      actions: redux.getActions(name),
    };

    return (
      <>
        {this.render_activity(name)}
        {this.render_error(name)}
        {this.render_pay_banner()}
        {this.render_tab_bar(name)}
        {React.createElement(this.props.course_panel, props)}
      </>
    );
  }

  private counts(
    name: string
  ): {
    students: number;
    assignments: number;
    handouts: number;
  } {
    const store: CourseStore = redux.getStore(name) as CourseStore;
    if (store == null) return { students: 0, assignments: 0, handouts: 0 }; // shouldn't happen?
    // have to use these functions on the store since only count non-deleted ones
    return {
      students: store.num_students(),
      assignments: store.num_assignments(),
      handouts: store.num_handouts(),
    };
  }

  private render_tab_bar(name: string): Rendered {
    return (
      <CourseTabBar
        actions={this.props.actions}
        frame_id={this.props.id}
        type={this.props.desc.get("type")}
        counts={this.counts(name)}
      />
    );
  }

  private render_pay_banner(): Rendered {
    if (this.props.students == null || this.props.settings == null) return;
    return (
      <PayBanner
        show_config={() => {
          this.props.actions.set_frame_type(
            this.props.id,
            "course_configuration"
          );
        }}
        settings={this.props.settings}
        num_students={this.props.students.size}
        tab={this.props.desc.get("type", "").slice("course_".length)}
      />
    );
  }

  private render_activity(name: string): Rendered {
    if (this.props.activity == null) return;
    return (
      <ActivityDisplay
        activity={values(this.props.activity.toJS())}
        trunc={80}
        on_clear={() => {
          const actions = redux.getActions(name) as CourseActions;
          if (actions != null) actions.clear_activity();
        }}
      />
    );
  }

  private render_error(name: string): Rendered {
    if (!this.props.error) return;
    return (
      <div style={{ margin: "5px 15px" }}>
        <ErrorDisplay
          error={this.props.error}
          onClose={() => {
            const actions = redux.getActions(name) as CourseActions;
            if (actions != null) actions.set_error("");
          }}
        />
      </div>
    );
  }

  public render(): Rendered {
    return (
      <div
        style={{ fontSize: `${this.props.font_size}px`, margin: "0 15px" }}
        className="smc-vfill"
      >
        {this.render_panel()}
      </div>
    );
  }
}

const ReduxCoursePanelWrapper = rclass(CoursePanelWrapper);

export function wrap(Panel) {
  const course_panel = (props) => React.createElement(Panel, props);

  class Wrapped extends Component<FrameProps> {
    public render(): Rendered {
      return React.createElement(
        ReduxCoursePanelWrapper,
        merge({ course_panel }, this.props)
      );
    }
  }
  return Wrapped;
}
