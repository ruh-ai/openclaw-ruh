import { describe, expect, test } from "bun:test";

import { createInitialBuilderMetadataState } from "../types";

describe("createInitialBuilderMetadataState", () => {
  test("creates the default builder metadata shape", () => {
    const state = createInitialBuilderMetadataState();

    expect(state).toEqual({
      draftAgentId: null,
      name: "",
      description: "",
      systemName: null,
      skillGraph: null,
      workflow: null,
      agentRules: [],
      toolConnectionHints: [],
      toolConnections: [],
      triggerHints: [],
      triggers: [],
      channelHints: [],
      improvements: [],
      draftSaveStatus: "idle",
      lastSavedAt: null,
      lastSavedHash: null,
    });
  });
});
