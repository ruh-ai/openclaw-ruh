import { describe, test as it, expect } from "bun:test";
import {
  createTextDeltaStateMachine,
  createCodeBlockExtractor,
  createBrowserExtractor,
  createTaskPlanExtractor,
} from "../event-middleware";

describe("createTextDeltaStateMachine", () => {
  it("handles plain text writing", () => {
    const machine = createTextDeltaStateMachine();
    const result = machine.process("Hello world");
    expect(result.cleanText).toBe("Hello world");
    expect(result.stepOps).toHaveLength(1);
    expect(result.stepOps[0].action).toBe("push");
    expect(result.stepOps[0].step?.kind).toBe("writing");
  });

  it("handles <think> ... </think> block", () => {
    const machine = createTextDeltaStateMachine();

    const r1 = machine.process("<think>");
    expect(r1.cleanText).toBe("");
    expect(r1.stepOps).toHaveLength(1);
    expect(r1.stepOps[0].step?.kind).toBe("thinking");

    const r2 = machine.process("reasoning content</think>");
    expect(r2.stepOps.some(op => op.action === "finish")).toBe(true);
  });

  it("handles <function=tool_name>...</function> block", () => {
    const machine = createTextDeltaStateMachine();
    const result = machine.process("<function=bash><parameter=cmd>ls -la</parameter></function>");
    expect(result.stepOps.some(op => op.step?.kind === "tool")).toBe(true);
    expect(result.stepOps.some(op => op.action === "finish")).toBe(true);
  });

  it("ignores a delayed </tool_call> wrapper before resuming visible text", () => {
    const machine = createTextDeltaStateMachine();

    const toolChunk = machine.process("<function=exec><parameter=command>ls -la</parameter></function>");
    expect(toolChunk.stepOps.some(op => op.step?.kind === "tool")).toBe(true);
    expect(toolChunk.stepOps.some(op => op.action === "finish")).toBe(true);

    const trailingWrapper = machine.process("</tool_call>\nDone.");
    expect(trailingWrapper.cleanText).toBe("Done.");
    expect(trailingWrapper.cleanText).not.toContain("</tool_call>");
    expect(trailingWrapper.stepOps.some(op => op.step?.kind === "writing")).toBe(true);
  });

  it("handles think then writing transition", () => {
    const machine = createTextDeltaStateMachine();
    machine.process("<think>thinking</think>");
    const r2 = machine.process("Now writing");
    expect(r2.cleanText).toBe("Now writing");
    expect(r2.stepOps.some(op => op.step?.kind === "writing")).toBe(true);
  });

  it("resets cleanly", () => {
    const machine = createTextDeltaStateMachine();
    machine.process("hello");
    machine.reset();
    const r = machine.process("new start");
    expect(r.cleanText).toBe("new start");
  });
});

describe("createCodeBlockExtractor", () => {
  it("detects opening ``` and creates a tool step", () => {
    let counter = 0;
    const extractor = createCodeBlockExtractor(() => counter, (n) => { counter = n; });
    // Simulate streaming: opening and content
    const ops1 = extractor.process("Here is the output:\n```bash\nls -la\n");
    expect(ops1.some(op => op.action === "push" && op.step?.kind === "tool")).toBe(true);
    // Closing
    const ops2 = extractor.process("```\n");
    expect(ops2.some(op => op.action === "finish")).toBe(true);
  });

  it("handles streaming code blocks", () => {
    let counter = 0;
    const extractor = createCodeBlockExtractor(() => counter, (n) => { counter = n; });
    const ops1 = extractor.process("```bash\n");
    expect(ops1.some(op => op.action === "push")).toBe(true);
    const ops2 = extractor.process("echo hello\n");
    expect(ops2.some(op => op.action === "update_detail")).toBe(true);
    const ops3 = extractor.process("```\n");
    expect(ops3.some(op => op.action === "finish")).toBe(true);
  });
});

describe("createBrowserExtractor", () => {
  it("extracts navigation URLs", () => {
    const extractor = createBrowserExtractor(() => "test-sandbox");
    const result = extractor.process("Navigating to https://example.com\n");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("navigation");
    expect(result.events[0].url).toBe("https://example.com");
  });

  it("extracts markdown images as screenshots", () => {
    const extractor = createBrowserExtractor(() => "test-sandbox");
    const result = extractor.process("![screenshot](https://img.example.com/shot.png)\n");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("screenshot");
  });

  it("deduplicates URLs", () => {
    const extractor = createBrowserExtractor(() => "test-sandbox");
    extractor.process("Navigating to https://example.com\n");
    const result2 = extractor.process("Visiting https://example.com\n");
    expect(result2.events).toHaveLength(0); // deduplicated
  });

  it("extracts port announcements", () => {
    const extractor = createBrowserExtractor(() => "test-sandbox");
    const result = extractor.process("Server running on port 3000\n");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("preview");
    expect(result.events[0].url).toBe("http://localhost:3000");
  });

  it("waits for newline before scanning", () => {
    const extractor = createBrowserExtractor(() => "test-sandbox");
    const result = extractor.process("Navigating to https://example.com");
    expect(result.events).toHaveLength(0); // no newline yet
    const result2 = extractor.process("\n");
    expect(result2.events).toHaveLength(1);
  });
});

describe("createTaskPlanExtractor", () => {
  it("parses a complete plan block", () => {
    const extractor = createTaskPlanExtractor();
    const plan = extractor.process("<plan>\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n</plan>");
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(3);
    expect(plan!.items[0].status).toBe("active"); // first non-done is active
    expect(plan!.totalTasks).toBe(3);
  });

  it("parses partial plan blocks during streaming", () => {
    const extractor = createTaskPlanExtractor();
    let plan = extractor.process("<plan>\n- [ ] Task 1\n");
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(1);
    plan = extractor.process("- [ ] Task 2\n");
    expect(plan!.items).toHaveLength(2);
  });

  it("applies task updates", () => {
    const extractor = createTaskPlanExtractor();
    extractor.process("<plan>\n- [ ] Task 1\n- [ ] Task 2\n</plan>");
    const plan = extractor.process('<task_update index="0" status="done"/>');
    expect(plan).not.toBeNull();
    expect(plan!.items[0].status).toBe("done");
    expect(plan!.items[1].status).toBe("active");
  });

  it("parses markdown checkbox fallback", () => {
    const extractor = createTaskPlanExtractor();
    const plan = extractor.process("- [ ] First\n- [ ] Second\n- [x] Third\n");
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(3);
    expect(plan!.items[2].status).toBe("done");
  });

  it("resets cleanly", () => {
    const extractor = createTaskPlanExtractor();
    extractor.process("<plan>\n- [ ] Old task\n</plan>");
    extractor.reset();
    expect(extractor.getPlan()).toBeNull();
    const plan = extractor.process("<plan>\n- [ ] New task\n</plan>");
    expect(plan!.items[0].label).toBe("New task");
  });
});
