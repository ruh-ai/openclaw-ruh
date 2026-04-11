import { describe, expect, test } from "bun:test";
import {
  createInitialAgentUIState,
  createInitialBuilderMetadataState,
} from "./types";

describe("AG-UI type factories", () => {
  test("createInitialAgentUIState returns valid defaults", () => {
    const state = createInitialAgentUIState();
    expect(state.taskPlan).toBeNull();
    expect(state.editorFiles).toEqual({ active: null, recent: [] });
    expect(state.steps).toEqual([]);
    expect(state.liveResponse).toBe("");
    expect(state.browser).toBeDefined();
  });

  test("createInitialBuilderMetadataState returns valid defaults", () => {
    const meta = createInitialBuilderMetadataState();
    expect(meta.draftAgentId).toBeNull();
    expect(meta.name).toBe("");
    expect(meta.description).toBe("");
    expect(meta.skillGraph).toBeNull();
    expect(meta.toolConnections).toEqual([]);
    expect(meta.triggers).toEqual([]);
    expect(meta.channelHints).toEqual([]);
    expect(meta.draftSaveStatus).toBe("idle");
  });
});
