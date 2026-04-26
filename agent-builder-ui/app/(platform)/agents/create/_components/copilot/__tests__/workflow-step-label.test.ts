import { describe, expect, test } from "bun:test";
import * as lifecycle from "../LifecycleStepRenderer";

describe("formatWorkflowStepLabel", () => {
  const formatWorkflowStepLabel = (lifecycle as Record<string, unknown>).formatWorkflowStepLabel as
    | ((step: unknown, index: number) => string)
    | undefined;

  test("formats canonical workflow step skills", () => {
    expect(formatWorkflowStepLabel).toBeFunction();
    expect(formatWorkflowStepLabel?.({ skill: "campaign_audit" }, 0)).toBe("campaign audit");
  });

  test("falls back to legacy workflow identifiers without throwing", () => {
    expect(formatWorkflowStepLabel).toBeFunction();
    expect(formatWorkflowStepLabel?.({ skillId: "budget_optimizer" }, 0)).toBe("budget optimizer");
    expect(formatWorkflowStepLabel?.({ node_id: "recovered-skill" }, 1)).toBe("recovered-skill");
    expect(formatWorkflowStepLabel?.({}, 2)).toBe("Step 3");
  });
});
