import { describe, expect, test, mock } from "bun:test";
import {
  reduceBuilderMetadataEvent,
  buildNormalizedDraftPayload,
  createSeededBuilderMetadataState,
  createBuilderMetadataAutosaveController,
} from "./builder-metadata-autosave";
import { createInitialBuilderMetadataState, CustomEventName } from "./types";

describe("reduceBuilderMetadataEvent", () => {
  const initial = createInitialBuilderMetadataState();

  test("WIZARD_UPDATE_FIELDS updates name, description, systemName", () => {
    const result = reduceBuilderMetadataEvent(initial, CustomEventName.WIZARD_UPDATE_FIELDS, {
      name: "Test Agent",
      description: "A test agent",
      systemName: "test-agent",
    });
    expect(result.name).toBe("Test Agent");
    expect(result.description).toBe("A test agent");
    expect(result.systemName).toBe("test-agent");
  });

  test("WIZARD_SET_SKILLS updates skillGraph and agentRules", () => {
    const nodes = [{ skill_id: "s1", description: "Skill 1" }];
    const result = reduceBuilderMetadataEvent(initial, CustomEventName.WIZARD_SET_SKILLS, {
      nodes,
      workflow: null,
      rules: ["Rule 1"],
      skillIds: ["s1"],
    });
    expect(result.skillGraph).toEqual(nodes);
    expect(result.agentRules).toEqual(["Rule 1"]);
  });

  test("WIZARD_CONNECT_TOOLS updates toolConnectionHints", () => {
    const result = reduceBuilderMetadataEvent(initial, CustomEventName.WIZARD_CONNECT_TOOLS, {
      toolIds: ["google-ads", "slack"],
    });
    expect(result.toolConnectionHints).toEqual(["google-ads", "slack"]);
  });

  test("WIZARD_SET_CHANNELS updates channelHints", () => {
    const result = reduceBuilderMetadataEvent(initial, CustomEventName.WIZARD_SET_CHANNELS, {
      channelIds: ["telegram"],
    });
    expect(result.channelHints).toEqual(["telegram"]);
  });

  test("unknown event returns metadata unchanged", () => {
    const result = reduceBuilderMetadataEvent(initial, "unknown_event", {});
    expect(result).toEqual(initial);
  });
});

describe("buildNormalizedDraftPayload", () => {
  test("returns null when no name and no skill graph", () => {
    const result = buildNormalizedDraftPayload(createInitialBuilderMetadataState(), null);
    expect(result).toBeNull();
  });

  test("returns payload when name is present", () => {
    const state = { ...createInitialBuilderMetadataState(), name: "My Agent" };
    const result = buildNormalizedDraftPayload(state, null);
    expect(result).not.toBeNull();
    expect(result!.payload.name).toBe("My Agent");
  });

  test("produces stable hash for same input", () => {
    const state = { ...createInitialBuilderMetadataState(), name: "Agent" };
    const r1 = buildNormalizedDraftPayload(state, null);
    const r2 = buildNormalizedDraftPayload(state, null);
    expect(r1!.hash).toBe(r2!.hash);
  });
});

describe("createSeededBuilderMetadataState", () => {
  test("returns initial state when no agent", () => {
    const state = createSeededBuilderMetadataState(null);
    expect(state.name).toBe("");
    expect(state.skillGraph).toBeNull();
  });

  test("seeds from agent when provided", () => {
    const agent = {
      id: "agent-1",
      name: "Existing",
      description: "Desc",
      skillGraph: [{ skill_id: "s1", description: "S1" }],
      workflow: null,
      agentRules: [],
      toolConnections: [],
      triggers: [],
      improvements: [],
    } as any;
    const state = createSeededBuilderMetadataState(agent);
    expect(state.name).toBe("Existing");
    expect(state.draftAgentId).toBe("agent-1");
  });
});

describe("createBuilderMetadataAutosaveController", () => {
  test("does not schedule if payload is null", () => {
    const scheduleFn = mock(() => 1);
    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft: mock(() => Promise.resolve({ id: "d1" } as any)),
      scheduler: { schedule: scheduleFn, clear: mock(() => {}) },
      now: () => "2026-01-01T00:00:00Z",
      onMetadataPatch: mock(() => {}),
    });
    controller.schedule(createInitialBuilderMetadataState());
    expect(scheduleFn).not.toHaveBeenCalled();
  });

  test("cancel clears scheduled handle", () => {
    const clearFn = mock(() => {});
    const controller = createBuilderMetadataAutosaveController({
      agent: null,
      saveAgentDraft: mock(() => Promise.resolve({ id: "d1" } as any)),
      scheduler: { schedule: () => 1, clear: clearFn },
      now: () => "2026-01-01T00:00:00Z",
      onMetadataPatch: mock(() => {}),
    });
    const metadata = { ...createInitialBuilderMetadataState(), name: "Test" };
    controller.schedule(metadata);
    controller.cancel();
    expect(clearFn).toHaveBeenCalled();
  });
});
