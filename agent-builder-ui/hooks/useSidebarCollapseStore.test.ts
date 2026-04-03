import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useSidebarCollapseStore } from "./useSidebarCollapseStore";

beforeEach(() => {
  useSidebarCollapseStore.setState({ isCollapsed: false });
});

describe("useSidebarCollapseStore", () => {
  test("initial state has sidebar expanded", () => {
    const state = useSidebarCollapseStore.getState();
    expect(state.isCollapsed).toBe(false);
  });

  test("toggleCollapse flips isCollapsed from false to true", () => {
    useSidebarCollapseStore.getState().toggleCollapse();
    expect(useSidebarCollapseStore.getState().isCollapsed).toBe(true);
  });

  test("toggleCollapse flips isCollapsed back to false on second call", () => {
    useSidebarCollapseStore.getState().toggleCollapse();
    useSidebarCollapseStore.getState().toggleCollapse();
    expect(useSidebarCollapseStore.getState().isCollapsed).toBe(false);
  });

  test("setCollapsed sets isCollapsed to the given value", () => {
    useSidebarCollapseStore.getState().setCollapsed(true);
    expect(useSidebarCollapseStore.getState().isCollapsed).toBe(true);

    useSidebarCollapseStore.getState().setCollapsed(false);
    expect(useSidebarCollapseStore.getState().isCollapsed).toBe(false);
  });

  test("setCollapsed(true) followed by toggle produces false", () => {
    useSidebarCollapseStore.getState().setCollapsed(true);
    useSidebarCollapseStore.getState().toggleCollapse();
    expect(useSidebarCollapseStore.getState().isCollapsed).toBe(false);
  });
});
