import { describe, expect, test } from "bun:test";

import { resolveCreatePageChatMode } from "./agent-mode";

describe("resolveCreatePageChatMode", () => {
  test("keeps the create page on builder chat while forge mode is building", () => {
    expect(resolveCreatePageChatMode("building")).toBe("builder");
  });

  test("switches the create page to agent chat while forge mode is live", () => {
    expect(resolveCreatePageChatMode("live")).toBe("agent");
  });
});
