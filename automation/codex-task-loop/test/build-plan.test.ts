import test from "node:test";
import assert from "node:assert/strict";

import { parseActiveCycleIssueOrder, selectNextPlannedIssue } from "../src/build-plan.js";

const buildPlan = `
## Current Execution Snapshot

Active cycle

- \`RUH-208\` Publish V1 boundary ADR and non-goals
- \`RUH-209\` Draft API and event contract v0.1 from current docs
- \`RUH-212\` Decide monorepo topology and package boundaries

Next cycle runway

- \`RUH-214\` Scaffold control plane API and worker service shells
`;

test("parses the active-cycle issue order from the build plan", () => {
  assert.deepEqual(parseActiveCycleIssueOrder(buildPlan), ["RUH-208", "RUH-209", "RUH-212"]);
});

test("picks the first open issue from the active-cycle order", () => {
  const selected = selectNextPlannedIssue(parseActiveCycleIssueOrder(buildPlan), [
    {
      id: "RUH-208",
      title: "Publish V1 boundary ADR and non-goals",
      description: "Create one decision note.",
      priority: 1,
      state: "Done",
      labels: [],
      blockedBy: [],
    },
    {
      id: "RUH-209",
      title: "Draft API and event contract v0.1 from current docs",
      description: "Draft the first contract set.",
      priority: 1,
      state: "Todo",
      labels: [],
      blockedBy: [],
    },
  ]);

  assert.equal(selected?.id, "RUH-209");
});
