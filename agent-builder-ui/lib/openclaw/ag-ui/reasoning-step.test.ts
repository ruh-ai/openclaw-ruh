import { describe, expect, test, mock } from "bun:test";
import {
  ensureReasoningStep,
  appendReasoningStepDetail,
  finishReasoningStep,
  type MutableStepIdRef,
} from "./reasoning-step";

describe("ensureReasoningStep", () => {
  test("creates a thinking step when ref is -1", () => {
    const ref: MutableStepIdRef = { current: -1 };
    const pushStep = mock(() => {});
    const id = ensureReasoningStep(ref, pushStep);
    expect(pushStep).toHaveBeenCalledTimes(1);
    expect(ref.current).not.toBe(-1);
    expect(id).toBe(ref.current);
  });

  test("does not create a new step if ref already set", () => {
    const ref: MutableStepIdRef = { current: 42 };
    const pushStep = mock(() => {});
    const id = ensureReasoningStep(ref, pushStep);
    expect(pushStep).not.toHaveBeenCalled();
    expect(id).toBe(42);
  });
});

describe("appendReasoningStepDetail", () => {
  test("calls updateStepDetail with ref current and detail", () => {
    const ref: MutableStepIdRef = { current: 10 };
    const updateStepDetail = mock(() => {});
    appendReasoningStepDetail(ref, "some detail", updateStepDetail);
    expect(updateStepDetail).toHaveBeenCalledWith(10, "some detail");
  });

  test("does nothing if ref is -1", () => {
    const ref: MutableStepIdRef = { current: -1 };
    const updateStepDetail = mock(() => {});
    appendReasoningStepDetail(ref, "detail", updateStepDetail);
    expect(updateStepDetail).not.toHaveBeenCalled();
  });

  test("does nothing if detail is empty string", () => {
    const ref: MutableStepIdRef = { current: 10 };
    const updateStepDetail = mock(() => {});
    appendReasoningStepDetail(ref, "", updateStepDetail);
    expect(updateStepDetail).not.toHaveBeenCalled();
  });
});

describe("finishReasoningStep", () => {
  test("calls finishStep and resets ref to -1", () => {
    const ref: MutableStepIdRef = { current: 10 };
    const finishStep = mock(() => {});
    finishReasoningStep(ref, finishStep);
    expect(finishStep).toHaveBeenCalledWith(10);
    expect(ref.current).toBe(-1);
  });

  test("does nothing if ref is already -1", () => {
    const ref: MutableStepIdRef = { current: -1 };
    const finishStep = mock(() => {});
    finishReasoningStep(ref, finishStep);
    expect(finishStep).not.toHaveBeenCalled();
  });
});
