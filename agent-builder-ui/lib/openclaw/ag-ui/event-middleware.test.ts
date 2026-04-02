import { describe, expect, test, beforeEach } from "bun:test";
import {
  createTextDeltaStateMachine,
  createCodeBlockExtractor,
  createBrowserExtractor,
  createTaskPlanExtractor,
} from "./event-middleware";

describe("createTextDeltaStateMachine", () => {
  test("plain text enters writing phase", () => {
    const sm = createTextDeltaStateMachine();
    const result = sm.process("Hello world");
    expect(result.cleanText).toBe("Hello world");
    expect(result.stepOps.length).toBeGreaterThanOrEqual(1);
    expect(result.stepOps[0].action).toBe("push");
    expect(result.stepOps[0].step?.kind).toBe("writing");
  });

  test("think tags create a thinking step", () => {
    const sm = createTextDeltaStateMachine();
    const result = sm.process("<think>reasoning here</think>");
    expect(result.cleanText).toBe("");
    const pushOp = result.stepOps.find((op) => op.action === "push" && op.step?.kind === "thinking");
    expect(pushOp).toBeDefined();
  });

  test("incomplete think tag produces update_detail", () => {
    const sm = createTextDeltaStateMachine();
    const result = sm.process("<think>partial reasoning");
    const updateOp = result.stepOps.find((op) => op.action === "update_detail");
    expect(updateOp).toBeDefined();
  });

  test("reset clears all state", () => {
    const sm = createTextDeltaStateMachine();
    sm.process("Hello");
    sm.reset();
    expect(sm.getRawBuf()).toBe("");
  });

  test("closing tool_call tag is consumed before next content", () => {
    const sm = createTextDeltaStateMachine();
    const r = sm.process("</tool_call>Hello");
    expect(r.cleanText).toBe("Hello");
  });
});

describe("createCodeBlockExtractor", () => {
  let counter: number;
  beforeEach(() => { counter = 0; });
  const getCounter = () => counter;
  const setCounter = (n: number) => { counter = n; };

  test("detects opening of a code block and creates a step", () => {
    const extractor = createCodeBlockExtractor(getCounter, setCounter);
    const ops = extractor.process("Here is code:\n```bash\necho hello\n");
    const pushOp = ops.find((op) => op.action === "push");
    expect(pushOp).toBeDefined();
    expect(pushOp?.step?.kind).toBe("tool");
  });

  test("detects closing of a code block and finishes step", () => {
    const extractor = createCodeBlockExtractor(getCounter, setCounter);
    extractor.process("```bash\necho hello\n");
    const ops = extractor.process("```");
    const finishOp = ops.find((op) => op.action === "finish");
    expect(finishOp).toBeDefined();
  });

  test("reset clears state", () => {
    const extractor = createCodeBlockExtractor(getCounter, setCounter);
    extractor.process("```bash\ncode\n");
    extractor.reset();
    const ops = extractor.process("```js\nconsole.log('hi')\n```\n");
    expect(ops.length).toBeGreaterThan(0);
  });
});

describe("createBrowserExtractor", () => {
  test("detects markdown image as screenshot event", () => {
    const extractor = createBrowserExtractor(() => "sandbox-1", "");
    const { events } = extractor.process("![Screenshot](http://example.com/img.png)\n");
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("screenshot");
  });

  test("detects navigation verb with URL", () => {
    const extractor = createBrowserExtractor(() => "sandbox-1", "");
    const { events } = extractor.process("Navigating to https://google.com\n");
    const navEvent = events.find((e) => e.type === "navigation");
    expect(navEvent).toBeDefined();
  });

  test("detects port announcement as preview event", () => {
    const extractor = createBrowserExtractor(() => "sandbox-1", "");
    const { events } = extractor.process("Server running on port 3000\n");
    const previewEvent = events.find((e) => e.type === "preview");
    expect(previewEvent).toBeDefined();
  });

  test("deduplicates URLs", () => {
    const extractor = createBrowserExtractor(() => "sandbox-1", "");
    extractor.process("Navigating to https://google.com\n");
    const { events } = extractor.process("Navigating to https://google.com\n");
    expect(events.length).toBe(0);
  });

  test("reset clears all state", () => {
    const extractor = createBrowserExtractor(() => "sandbox-1", "");
    extractor.process("Navigating to https://google.com\n");
    extractor.reset();
    const { events } = extractor.process("Navigating to https://google.com\n");
    expect(events.length).toBe(1);
  });
});

describe("createTaskPlanExtractor", () => {
  test("returns null for text without a plan block", () => {
    const extractor = createTaskPlanExtractor();
    const plan = extractor.process("Just some regular text.");
    expect(plan).toBeNull();
  });

  test("parses markdown checkbox list as task plan", () => {
    const extractor = createTaskPlanExtractor();
    const plan = extractor.process("- [ ] First task\n- [ ] Second task\n- [x] Done task\n");
    expect(plan).not.toBeNull();
    if (plan) {
      expect(plan.items.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("reset clears state and getPlan returns null", () => {
    const extractor = createTaskPlanExtractor();
    extractor.process("- [ ] Task\n");
    extractor.reset();
    expect(extractor.getPlan()).toBeNull();
  });
});
