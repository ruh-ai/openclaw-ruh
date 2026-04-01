import { describe, expect, test } from "bun:test";

async function loadReasoningStepHelpers() {
  return await import("../reasoning-step").catch(() => null);
}

describe("reasoning step lifecycle", () => {
  test("reuses one step id from start through finish", async () => {
    const helpers = await loadReasoningStepHelpers();
    const ensureReasoningStep = helpers?.ensureReasoningStep;
    const appendReasoningStepDetail = helpers?.appendReasoningStepDetail;
    const finishReasoningStep = helpers?.finishReasoningStep;

    expect(typeof ensureReasoningStep).toBe("function");
    expect(typeof appendReasoningStepDetail).toBe("function");
    expect(typeof finishReasoningStep).toBe("function");

    const thinkStepIdRef = { current: -1 };
    const pushedIds: number[] = [];
    const updated: Array<{ id: number; detail: string }> = [];
    const finishedIds: number[] = [];

    ensureReasoningStep?.(thinkStepIdRef, (step) => pushedIds.push(step.id));
    appendReasoningStepDetail?.(thinkStepIdRef, "first chunk", (id, detail) => {
      updated.push({ id, detail });
    });
    finishReasoningStep?.(thinkStepIdRef, (id) => finishedIds.push(id));

    expect(pushedIds).toHaveLength(1);
    expect(updated).toEqual([{ id: pushedIds[0], detail: "first chunk" }]);
    expect(finishedIds).toEqual([pushedIds[0]]);
    expect(thinkStepIdRef.current).toBe(-1);
  });
});
