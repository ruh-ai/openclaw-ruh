import type { AgentStep } from "./types";

export interface MutableStepIdRef {
  current: number;
}

export function ensureReasoningStep(
  thinkStepIdRef: MutableStepIdRef,
  pushStep: (step: AgentStep) => void,
): number {
  if (thinkStepIdRef.current === -1) {
    const now = Date.now();
    thinkStepIdRef.current = now;
    pushStep({
      id: now,
      kind: "thinking",
      label: "Reasoning",
      status: "active",
      startedAt: now,
    });
  }

  return thinkStepIdRef.current;
}

export function appendReasoningStepDetail(
  thinkStepIdRef: MutableStepIdRef,
  detail: string,
  updateStepDetail: (id: number, detail: string) => void,
): void {
  if (thinkStepIdRef.current === -1 || detail.length === 0) return;
  updateStepDetail(thinkStepIdRef.current, detail);
}

export function finishReasoningStep(
  thinkStepIdRef: MutableStepIdRef,
  finishStep: (id: number) => void,
): void {
  if (thinkStepIdRef.current === -1) return;
  finishStep(thinkStepIdRef.current);
  thinkStepIdRef.current = -1;
}
