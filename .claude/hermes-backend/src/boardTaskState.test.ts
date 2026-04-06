import { describe, expect, it } from "bun:test";
import { normalizeBoardTaskFingerprint, taskLogStatusToBoardStatus } from "./boardTaskState";

describe("normalizeBoardTaskFingerprint", () => {
  it("collapses formatting differences so duplicate analyst tasks normalize to the same fingerprint", () => {
    expect(normalizeBoardTaskFingerprint("  Build   the Goals Board!! ")).toBe("build the goals board");
    expect(normalizeBoardTaskFingerprint("build the goals board")).toBe("build the goals board");
  });
});

describe("taskLogStatusToBoardStatus", () => {
  it("maps execution task statuses onto board column statuses", () => {
    expect(taskLogStatusToBoardStatus("pending")).toBe("in_progress");
    expect(taskLogStatusToBoardStatus("running")).toBe("in_progress");
    expect(taskLogStatusToBoardStatus("completed")).toBe("done");
    expect(taskLogStatusToBoardStatus("failed")).toBe("blocked");
    expect(taskLogStatusToBoardStatus("unknown")).toBe("todo");
  });
});
