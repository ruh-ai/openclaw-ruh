import { describe, test, expect } from "bun:test";
import {
  parseTaskPlanBlock,
  parsePartialTaskPlanBlock,
  parseMarkdownCheckboxList,
  extractTaskUpdates,
  applyTaskUpdate,
  applyTaskUpdates,
  stripPlanTags,
  type TaskPlan,
} from "./task-plan-parser";

describe("parseTaskPlanBlock", () => {
  test("parses a complete plan block with 3 items", () => {
    const text = `Here is my plan:\n<plan>\n- [ ] Research API docs\n- [ ] Design data model\n- [ ] Implement endpoints\n</plan>\nLet me start...`;
    const plan = parseTaskPlanBlock(text);

    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(3);
    expect(plan!.totalTasks).toBe(3);
    expect(plan!.items[0].label).toBe("Research API docs");
    expect(plan!.items[1].label).toBe("Design data model");
    expect(plan!.items[2].label).toBe("Implement endpoints");
    // First item should be active, rest pending
    expect(plan!.items[0].status).toBe("active");
    expect(plan!.items[1].status).toBe("pending");
    expect(plan!.items[2].status).toBe("pending");
    expect(plan!.currentTaskIndex).toBe(0);
  });

  test("parses plan with pre-checked items", () => {
    const text = `<plan>\n- [x] Step one\n- [x] Step two\n- [ ] Step three\n</plan>`;
    const plan = parseTaskPlanBlock(text);

    expect(plan).not.toBeNull();
    expect(plan!.items[0].status).toBe("done");
    expect(plan!.items[1].status).toBe("done");
    expect(plan!.items[2].status).toBe("active"); // first non-done → active
    expect(plan!.currentTaskIndex).toBe(2);
  });

  test("parses nested plan items (2-space indent)", () => {
    const text = `<plan>\n- [ ] Setup project\n  - [ ] Create repo\n  - [ ] Install deps\n- [ ] Write code\n</plan>`;
    const plan = parseTaskPlanBlock(text);

    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(2);
    expect(plan!.items[0].children).toHaveLength(2);
    expect(plan!.items[0].children![0].label).toBe("Create repo");
    expect(plan!.items[0].children![1].label).toBe("Install deps");
    expect(plan!.totalTasks).toBe(4); // 2 parents + 2 children
  });

  test("returns null for text with no plan block", () => {
    expect(parseTaskPlanBlock("Hello world, no plan here")).toBeNull();
  });

  test("returns null for unclosed plan block", () => {
    expect(parseTaskPlanBlock("<plan>\n- [ ] Task 1")).toBeNull();
  });

  test("returns null for empty plan block", () => {
    expect(parseTaskPlanBlock("<plan>\n\n</plan>")).toBeNull();
  });

  test("handles plan with uppercase X checkmarks", () => {
    const text = `<plan>\n- [X] Done task\n- [ ] Pending\n</plan>`;
    const plan = parseTaskPlanBlock(text);

    expect(plan).not.toBeNull();
    expect(plan!.items[0].status).toBe("done");
    expect(plan!.items[1].status).toBe("active");
  });
});

describe("parsePartialTaskPlanBlock", () => {
  test("returns items from an incomplete plan block", () => {
    const text = `<plan>\n- [ ] Task one\n- [ ] Task two\n- [ ] Task three`;
    const plan = parsePartialTaskPlanBlock(text);

    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(3);
    expect(plan!.items[0].label).toBe("Task one");
    expect(plan!.items[2].label).toBe("Task three");
  });

  test("returns null if no plan tag found", () => {
    expect(parsePartialTaskPlanBlock("just text")).toBeNull();
  });

  test("works with complete plan block too", () => {
    const text = `<plan>\n- [ ] A\n- [ ] B\n</plan>`;
    const plan = parsePartialTaskPlanBlock(text);
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(2);
  });
});

describe("parseMarkdownCheckboxList", () => {
  test("parses markdown checkbox list as fallback", () => {
    const text = `Here are the steps:\n- [x] Done task\n- [ ] Pending task\n- [ ] Another pending\n\nLet me start.`;
    const plan = parseMarkdownCheckboxList(text);

    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(3);
    expect(plan!.items[0].status).toBe("done");
    expect(plan!.items[1].status).toBe("active");
    expect(plan!.items[2].status).toBe("pending");
  });

  test("returns null for fewer than 2 checkbox items", () => {
    expect(parseMarkdownCheckboxList("- [ ] Only one")).toBeNull();
  });

  test("returns null if <plan> block exists (defers to plan parser)", () => {
    const text = `<plan>\n- [ ] A\n- [ ] B\n</plan>`;
    expect(parseMarkdownCheckboxList(text)).toBeNull();
  });

  test("ignores non-checkbox lines", () => {
    const text = `- [x] First\n- Some other bullet\n- [ ] Second`;
    const plan = parseMarkdownCheckboxList(text);
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(2);
  });
});

describe("extractTaskUpdates", () => {
  test("extracts single task update", () => {
    const text = `Some text <task_update index="0" status="done"/> more text`;
    const updates = extractTaskUpdates(text);
    expect(updates).toEqual([{ index: 0, status: "done" }]);
  });

  test("extracts multiple task updates", () => {
    const text = `<task_update index="0" status="done"/><task_update index="1" status="done"/>`;
    const updates = extractTaskUpdates(text);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({ index: 0, status: "done" });
    expect(updates[1]).toEqual({ index: 1, status: "done" });
  });

  test("returns empty array for no updates", () => {
    expect(extractTaskUpdates("no updates here")).toEqual([]);
  });

  test("handles active status", () => {
    const updates = extractTaskUpdates(`<task_update index="2" status="active"/>`);
    expect(updates).toEqual([{ index: 2, status: "active" }]);
  });
});

describe("applyTaskUpdate", () => {
  const basePlan: TaskPlan = {
    items: [
      { id: 1, label: "Task A", status: "active" },
      { id: 2, label: "Task B", status: "pending" },
      { id: 3, label: "Task C", status: "pending" },
    ],
    currentTaskIndex: 0,
    totalTasks: 3,
  };

  test("marks item done and advances current index", () => {
    const updated = applyTaskUpdate(basePlan, 0, "done");
    expect(updated.items[0].status).toBe("done");
    expect(updated.items[1].status).toBe("active"); // auto-activated
    expect(updated.currentTaskIndex).toBe(1);
  });

  test("marks last item done sets index to -1", () => {
    const allDoneBut3: TaskPlan = {
      ...basePlan,
      items: [
        { id: 1, label: "A", status: "done" },
        { id: 2, label: "B", status: "done" },
        { id: 3, label: "C", status: "active" },
      ],
      currentTaskIndex: 2,
    };
    const updated = applyTaskUpdate(allDoneBut3, 2, "done");
    expect(updated.items[2].status).toBe("done");
    expect(updated.currentTaskIndex).toBe(-1);
  });

  test("does not modify original plan (immutable)", () => {
    applyTaskUpdate(basePlan, 0, "done");
    expect(basePlan.items[0].status).toBe("active"); // unchanged
  });
});

describe("applyTaskUpdates", () => {
  test("applies multiple updates in sequence", () => {
    const plan: TaskPlan = {
      items: [
        { id: 1, label: "A", status: "active" },
        { id: 2, label: "B", status: "pending" },
        { id: 3, label: "C", status: "pending" },
      ],
      currentTaskIndex: 0,
      totalTasks: 3,
    };

    const updated = applyTaskUpdates(plan, [
      { index: 0, status: "done" },
      { index: 1, status: "done" },
    ]);

    expect(updated.items[0].status).toBe("done");
    expect(updated.items[1].status).toBe("done");
    expect(updated.items[2].status).toBe("active");
    expect(updated.currentTaskIndex).toBe(2);
  });
});

describe("stripPlanTags", () => {
  test("removes <plan> blocks", () => {
    const text = `Before\n<plan>\n- [ ] A\n- [ ] B\n</plan>\nAfter`;
    expect(stripPlanTags(text)).toBe("Before\n\nAfter");
  });

  test("removes <task_update/> tags", () => {
    const text = `Some text<task_update index="0" status="done"/>more text`;
    expect(stripPlanTags(text)).toBe("Some textmore text");
  });

  test("removes both plan blocks and task updates", () => {
    const text = `<plan>\n- [ ] X\n</plan>Hello<task_update index="0" status="done"/>World`;
    expect(stripPlanTags(text)).toBe("HelloWorld");
  });

  test("returns unchanged text if no plan tags", () => {
    expect(stripPlanTags("no tags here")).toBe("no tags here");
  });

  test("strips copilot lifecycle markers so they don't render as raw XML in chat", () => {
    const text =
      'Before I start:\n' +
      '<ask_user id="q1" type="text" question="Who?"/>\n' +
      '<ask_user id="q2" type="select" question="Which?" options=\'["a","b"]\'/>\n' +
      '<ask_user id="q3" type="multiselect" question="Which surfaces?" options=\'["Backend lifecycle APIs/logs","Database/state checks"]\'/>\n' +
      '<think_step step="research" status="started"/>\n' +
      '<think_research_finding title="Docs" summary="Local logs" source="https://docs.openclaw.ai/tools/browser"/>\n' +
      '<think_document_ready docType="prd" path="PRD.md"/>\n' +
      '<plan_skills skills=\'[{"id":"x"}]\'/>\n' +
      '<plan_data_schema dataSchema=\'{"artifactRoot":".openclaw/flow-qa/evidence/<run_id>/"}\'/>\n' +
      '<plan_dashboard_prototype dashboardPrototype=\'{"summary":"Estimator workspace"}\'/>\n' +
      '<plan_complete/>\n' +
      '<reveal_done/>\n' +
      'After.';
    const stripped = stripPlanTags(text);
    expect(stripped).not.toContain("<ask_user");
    expect(stripped).not.toContain("<think_step");
    expect(stripped).not.toContain("<think_research_finding");
    expect(stripped).not.toContain("<think_document_ready");
    expect(stripped).not.toContain("<plan_skills");
    expect(stripped).not.toContain("<plan_data_schema");
    expect(stripped).not.toContain("<plan_dashboard_prototype");
    expect(stripped).not.toContain("<plan_complete");
    expect(stripped).not.toContain("<reveal_done");
    expect(stripped).toContain("Before I start:");
    expect(stripped).toContain("After.");
  });
});
