import { describe, expect, test } from "bun:test";

import { CREATE_AGENT_MODE_OPTIONS, normalizeCreateMode } from "./create-mode";

describe("create-mode contract", () => {
  test("does not expose the retired guided mode as a selectable option", () => {
    expect(CREATE_AGENT_MODE_OPTIONS.map((mode) => mode.id)).toEqual([
      "copilot",
      "chat",
    ]);
  });

  test("fails closed to Co-Pilot when legacy guided mode is requested", () => {
    expect(normalizeCreateMode("wizard")).toBe("copilot");
    expect(normalizeCreateMode("copilot")).toBe("copilot");
    expect(normalizeCreateMode("chat")).toBe("chat");
  });
});
