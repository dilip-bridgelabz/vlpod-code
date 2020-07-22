/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* WARNING/TODO:

   scroll_to_index does basically NOTHING right now.
   This is due to an API change in react-window,
   which I just found by installing @types/react-window.
*/

// Windowed List, based on react-window:
//
// - automatically handles rows changing sizes, which I guess solves this problem?  https://github.com/bvaughn/react-window/issues/6
//
// - handles maintaining sroll position between unmount/mount
//
// - We use react-window instead of react-virtualized, since react-window is
//   enough for our needs, is faster, is smaller, and seems to work better.
//   I did implement everything first using react-virtualized, but react-window
//   is definitely faster, and the overscan seems to work much better.

import { delay } from "awaiting";

// The ResizeObserver polyfill in the resize-observer package is
// really weird because it *always* gets used, even if the browser
// has its own native ResizeObserver implementation, which is
// most browsers these days.  Hence we do the following, which saves
// wasted time according to the profiler.
let ResizeObserver: any = (window as any).ResizeObserver;
if (ResizeObserver == null) {
  ResizeObserver = require("resize-observer").ResizeObserver;
}
const SHRINK_THRESH: number = 10;

import { VariableSizeList as List, ListOnScrollProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";

export interface ScrollInfo extends ListOnScrollProps {
  maxScrollOffset?: number;
}

import { React, Component, Rendered } from "../app-framework";

interface Props {
  overscan_row_count: number; // how many not visible cells to render on each side of window
  estimated_row_size: number; // estimate to use for the row size before measuring
  row_count: number; // number of rows
  row_renderer: (obj: {
    key: string;
    index: number;
    isScrolling?: boolean;
    isVisible?: boolean;
  }) => Rendered; // renders row with given key (or index).
  row_key: (index: number) => string | undefined; // map from row number to string key; must have unique stable keys!
  scroll_to_index?: number; // moves to this row during next render (but doesn't get stuck there!)
  scroll_top?: number;
  cache_id?: string; // if set, the measured cell sizes and scroll position are preserved between unmount/mounts
  on_scroll?: (info: ScrollInfo) => void;
  use_is_scrolling?: boolean;
  hide_resize?: boolean;
  render_info?: boolean; // if true, record RenderInfo; also makes isVisible available for row_renderer.
  scroll_margin?: number;
}

interface State {
  scroll_to_index?: number;
  scroll_top?: number;
}

interface RenderInfo {
  overscanStartIndex: number;
  overscanStopIndex: number;
  visibleStartIndex: number;
  visibleStopIndex: number;
}

// TODO: this should be an LRU cache, to avoid a longterm memory leak.
const scroll_cache: {
  [cache_id: string]: {
    info: ListOnScrollProps;
    row_heights_cache: { [key: string]: number };
  };
} = {};

export class WindowedList extends Component<Props, State> {
  private cell_refs: { [key: string]: any } = {};
  private list_ref;
  private row_heights_cache: { [key: string]: number } = {};
  private row_heights_stale: { [key: string]: boolean } = {};
  private row_heights_removed: { [key: string]: boolean } = {};
  public resize_observer: any; // ResizeObserver, but can't because that's only for the polyfill...
  private is_mounted: boolean = true;
  private _disable_refresh: boolean = false;
  private RowComponent: any;
  private height: number = 0;
  private width: number = 0;
  private scroll_info: ScrollInfo = {
    scrollDirection: "forward",
    scrollOffset: 0,
    scrollUpdateWasRequested: false,
  };

  public render_info: RenderInfo = {
    overscanStartIndex: 0,
    overscanStopIndex: 0,
    visibleStartIndex: 0,
    visibleStopIndex: 0,
  };
  private ensure_visible?: { row: number; align: string };

  constructor(props) {
    super(props);
    this.list_ref = React.createRef();
    this.resize_observer = new ResizeObserver(this.cell_resized.bind(this));
    let scroll_top: number | undefined = props.scroll_top;
    if (scroll_top == null && this.props.cache_id != null) {
      const x = scroll_cache[this.props.cache_id];
      if (x != null) {
        scroll_top = x.info.scrollOffset;
        this.row_heights_cache = x.row_heights_cache;
      }
    }
    this.state = { scroll_to_index: props.scroll_to_index, scroll_top };
    this.RowComponent = create_row_component(this);
  }

  public componentWillUnmount(): void {
    this.is_mounted = false;
  }

  public scrollToRow(row: number, align: string = "auto"): void {
    if (this.list_ref.current == null || this.props.row_count == 0) return;
    if (row < 0) {
      row = row % this.props.row_count;
      if (row < 0) {
        row += this.props.row_count;
      }
    }

    if (align == "top") {
      // react-window doesn't have align=top, but we **need** it for jupyter
      // This implementation isn't done; it's just to prove we can do it.
      // Here "top" means the top of the row is in view nicely.
      this.scrollToRow(row, "auto"); // at least get it into view, so metadata useful.
      const meta = this.get_row_metadata(row);
      if (meta == null) {
        return;
      }
      const { scrollOffset } = this.get_scroll_info();
      const height = this.get_window_height();
      const margin = this.props.scroll_margin ? this.props.scroll_margin : 10;
      let delta: number = 0;
      if (meta.offset >= scrollOffset + height - margin) {
        // cell is too far down
        delta = meta.offset - (scrollOffset + height - margin);
      } else if (meta.offset <= scrollOffset + margin) {
        // cell is too far up
        delta = meta.offset - (scrollOffset + margin);
      }
      if (delta != 0) {
        this.scrollToPosition(scrollOffset + delta);
      }
    } else {
      // align is auto, end, start, center
      this.list_ref.current.scrollToItem(row, align);
    }
  }

  public async ensure_row_is_visible(
    row: number,
    align: string = "auto"
  ): Promise<void> {
    this.ensure_visible = { row, align };
    for (let i = 1; i < 10; i++) {
      const { row, align } = this.ensure_visible;
      this.scrollToRow(row, align);
      await delay(30);
      if (!this.is_mounted) return;
      if (
        this.render_info != null &&
        this.render_info.visibleStartIndex <= row &&
        row <= this.render_info.visibleStopIndex
      ) {
        return;
      }
    }
  }

  public get_row_metadata(
    row: number
  ): { offset: number; size: number } | undefined {
    if (this.list_ref.current == null) return;
    const instanceProps = this.list_ref.current._instanceProps;
    if (instanceProps == null) return;
    const { itemMetadataMap } = instanceProps;
    if (itemMetadataMap == null) return;
    return itemMetadataMap[row];
  }

  public get_window_height(): number {
    return this.height;
  }

  public get_window_width(): number {
    return this.width;
  }

  public get_total_height(): number {
    const meta = this.get_row_metadata(this.props.row_count - 1);
    if (meta == null) return 0;
    return meta.offset + meta.size;
  }

  public get_scroll_info(): any {
    return this.scroll_info;
  }

  public scrollToPosition(pos: number): void {
    if (this.list_ref.current == null || pos == null) return;
    this.list_ref.current.scrollTo(pos);
  }

  // Last scroll info
  public get_scroll(): ListOnScrollProps | undefined {
    if (this.props.cache_id == null) {
      throw Error("you must set the cache_id before using get_scroll");
    }
    const x = scroll_cache[this.props.cache_id as string];
    if (x == null) return;
    return x.info;
  }

  private cell_resized(entries: any[]): void {
    let num_changed: number = 0;
    let min_index: number = 999999;
    for (const entry of entries) {
      const elt = entry.target;
      const key = elt.getAttribute("data-key");
      if (key == null) continue;
      if (isNaN(entry.contentRect.height) || entry.contentRect.height === 0) {
        if (this.row_heights_cache[key] > 0) {
          // A row was deleted (or isn't visible), so goes from a
          // possibly big height to 0.
          this.row_heights_removed[key] = true;
        }
        continue;
      }

      const index = elt.getAttribute("data-index");
      if (this.row_heights_removed[key]) {
        delete this.row_heights_removed[key];
        if (
          Math.abs(this.row_heights_cache[key] - entry.contentRect.height) < 3
        ) {
          // Last time it changed it was removed, and now it is back but with
          // a (significantly) different height
          this.row_heights_cache[key] = entry.contentRect.height;
          this.row_heights_stale[key] = true;
          num_changed += 1;
          if (index != null) {
            min_index = Math.min(min_index, parseInt(index));
          }
          continue;
        }
      }

      const s = entry.contentRect.height - this.row_heights_cache[key];
      if (s == 0 || (s < 0 && -s <= SHRINK_THRESH)) {
        // not really changed or just disappeared from DOM or just shrunk a little,
        // ... so continue using what we have cached (or the default).
        continue;
      }
      if (index != null) {
        min_index = Math.min(min_index, parseInt(index));
      }
      this.row_heights_stale[key] = true;
      num_changed += 1;
    }
    if (num_changed > 0) this.refresh(min_index);
  }

  public disable_refresh(): void {
    this._disable_refresh = true;
  }

  public enable_refresh(): void {
    this._disable_refresh = false;
  }

  public refresh(min_index: number = 0): void {
    if (this._disable_refresh) return;
    if (this.list_ref.current == null) return;
    this.list_ref.current.resetAfterIndex(min_index, true);
  }

  public row_ref(key: string): any {
    return this.cell_refs[key];
  }

  public row_height(index: number): number {
    const key = this.props.row_key(index);
    if (key == null) return 0;

    let h = this.row_heights_cache[key];
    if (h !== undefined && !this.row_heights_stale[key]) {
      return h;
    }
    if (h === undefined) h = 0;

    const elt = this.cell_refs[key];
    if (elt == null) {
      return h ? h : this.props.estimated_row_size;
    }

    let ht = elt.height();
    if (Math.abs(h - ht) <= SHRINK_THRESH) {
      // don't shrink if there are little jiggles.
      ht = Math.max(h, ht);
    }
    if (ht === 0) {
      return h ? h : this.props.estimated_row_size;
    }

    if (
      this.row_heights_cache[key] == undefined ||
      this.row_heights_stale[key]
    ) {
      this.row_heights_cache[key] = ht;
      delete this.row_heights_stale[key];
    }

    return ht;
  }

  private async scroll_after_measure(): Promise<void> {
    const { scroll_to_index, scroll_top } = this.state;
    if (scroll_to_index == null && scroll_top == null) {
      return;
    }
    // Do this so it only scrolls to this index or position once.
    // Otherwise, things are horribly broken on scroll after using
    // scroll_to_index.
    await delay(1);
    if (!this.is_mounted) return;
    this.setState({
      scroll_to_index: undefined,
      scroll_top: undefined,
    });
  }

  public render(): Rendered {
    let on_scroll: undefined | ((info: ListOnScrollProps) => void) = undefined;
    if (this.props.cache_id != null || this.props.on_scroll != null) {
      on_scroll = (info: ListOnScrollProps): void => {
        const a = $(this.list_ref.current?._outerRef);
        let maxScrollOffset = 0;
        if (a != null && a[0] != null) {
          maxScrollOffset = a[0].scrollHeight - (a.height() ?? 0);
        }
        this.scroll_info = {
          ...info,
          ...{ maxScrollOffset },
        };
        if (this.props.on_scroll != null) {
          this.props.on_scroll(this.scroll_info);
        }
        if (this.props.cache_id != null) {
          scroll_cache[this.props.cache_id as string] = {
            info: this.scroll_info,
            row_heights_cache: this.row_heights_cache,
          };
        }
      };
    }

    const save_render_info = this.props.render_info
      ? (info) => {
          this.render_info = info;
        }
      : undefined;

    return (
      <div
        className="smc-vfill"
        style={{ width: "100%" }}
        key={"list-of-cells"}
      >
        <AutoSizer>
          {({ height, width }) => {
            this.height = height;
            this.width = width;
            const elt = (
              <List
                ref={this.list_ref}
                height={height}
                width={width}
                overscanCount={this.props.overscan_row_count}
                estimatedItemSize={this.props.estimated_row_size}
                itemSize={this.row_height.bind(this)}
                itemCount={this.props.row_count}
                initialScrollOffset={this.state.scroll_top}
                onScroll={on_scroll}
                useIsScrolling={this.props.use_is_scrolling}
                onItemsRendered={save_render_info}
              >
                {this.RowComponent}
              </List>
            );
            this.scroll_after_measure();
            return elt;
          }}
        </AutoSizer>
      </div>
    );
  }
}

interface RowRendererProps {
  index: number;
  style: React.CSSProperties;
  isScrolling?: boolean;
}

function create_row_component(windowed_list: WindowedList) {
  class RowComponent extends Component<RowRendererProps> {
    private render_wrap(
      index: number,
      key: string,
      isScrolling?: boolean
    ): Rendered {
      let isVisible: boolean | undefined;
      if (windowed_list.props.render_info) {
        isVisible =
          index >= windowed_list.render_info.visibleStartIndex &&
          index <= windowed_list.render_info.visibleStopIndex;
      }
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
          data-key={key}
          data-index={index}
          ref={(node) => {
            if (node == null) return;
            (windowed_list as any).cell_refs[key] = $(node);
            (windowed_list as any).resize_observer.observe(node);
          }}
        >
          {windowed_list.props.row_renderer({
            key,
            index,
            isScrolling,
            isVisible,
          })}
        </div>
      );
    }

    public render(): Rendered {
      const { index, style, isScrolling } = this.props;
      const key = windowed_list.props.row_key(index);
      if (key == null) return <div />;

      /* We use flex in the first nested div below so that the
       div expands to its contents. See
       https://stackoverflow.com/questions/1709442/make-divs-height-expand-with-its-content
      */
      let wrap = this.render_wrap(index, key, isScrolling);
      if (windowed_list.props.hide_resize) {
        wrap = <div style={{ overflow: "hidden", height: "100%" }}>{wrap}</div>;
      }
      return (
        <div style={style} key={`${index}-${key}`}>
          {wrap}
        </div>
      );
    }
  }
  return RowComponent;
}
