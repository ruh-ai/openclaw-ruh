/**
 * Event middleware — stateful text-processing extractors.
 *
 * These replace the processDelta, processCodeBlocks, processForBrowser,
 * and processTaskPlan callbacks that were embedded in TabChat.tsx.
 * Each factory returns a stateful closure that can be tested independently.
 */

import {
  applyBrowserWorkspaceEvent,
  type BrowserWorkspaceEvent,
  type BrowserWorkspaceState,
  createEmptyBrowserWorkspaceState,
} from "../browser-workspace";
import {
  parsePartialTaskPlanBlock,
  parseMarkdownCheckboxList,
  extractTaskUpdates,
  applyTaskUpdates,
  type TaskPlan,
} from "../task-plan-parser";
import type { AgentStep, StepStatus } from "./types";

// ─── Step operations returned by middleware ──────────────────────────────────

export interface StepOp {
  action: "push" | "finish" | "update_detail";
  step?: AgentStep;
  id?: number;
  detail?: string;
}

export interface TextDeltaResult {
  cleanText: string; // text to append to liveResponse (may be empty during think/tool phases)
  stepOps: StepOp[];
}

// ─── Text Delta State Machine ───────────────────────────────────────────────
// Replaces processDelta from TabChat (lines 1118-1206)

type DeltaPhase = "pre_think" | "in_think" | "post_think" | "in_tool" | "writing";

export function createTextDeltaStateMachine() {
  let rawBuf = "";
  let stepCounter = 0;
  let phase: DeltaPhase = "pre_think";
  let thinkStepId = -1;
  let toolStepId = -1;
  let writeStepId = -1;

  function process(delta: string): TextDeltaResult {
    const ops: StepOp[] = [];
    let cleanText = "";

    rawBuf += delta;

    if (phase !== "in_tool" && rawBuf.startsWith("</tool_call>")) {
      rawBuf = rawBuf.slice("</tool_call>".length).trimStart();
      if (!rawBuf) {
        return { cleanText, stepOps: ops };
      }
      return process("");
    }

    const buf = rawBuf;

    if (phase === "pre_think") {
      if (buf.startsWith("<think>")) {
        phase = "in_think";
        const id = stepCounter++;
        thinkStepId = id;
        ops.push({ action: "push", step: { id, kind: "thinking", label: "Reasoning", status: "active", startedAt: Date.now() } });
      } else if (buf.startsWith("<function=")) {
        phase = "in_tool";
        const sub = process("");
        ops.push(...sub.stepOps);
        cleanText += sub.cleanText;
      } else if (buf.length > 0 && !buf.startsWith("<")) {
        phase = "writing";
        const id = stepCounter++;
        writeStepId = id;
        ops.push({ action: "push", step: { id, kind: "writing", label: "Writing response…", status: "active", startedAt: Date.now() } });
        cleanText = buf;
      }
      return { cleanText, stepOps: ops };
    }

    if (phase === "in_think") {
      const closeIdx = buf.indexOf("</think>");
      if (closeIdx === -1) {
        ops.push({ action: "update_detail", id: thinkStepId, detail: buf.slice("<think>".length) });
      } else {
        ops.push({ action: "finish", id: thinkStepId, detail: buf.slice("<think>".length, closeIdx) });
        rawBuf = buf.slice(closeIdx + "</think>".length).trimStart();
        phase = "post_think";
        if (rawBuf) {
          const sub = process("");
          ops.push(...sub.stepOps);
          cleanText += sub.cleanText;
        }
      }
      return { cleanText, stepOps: ops };
    }

    if (phase === "post_think") {
      const toolStart = buf.indexOf("<function=");
      if (toolStart === 0) {
        phase = "in_tool";
        const sub = process("");
        ops.push(...sub.stepOps);
        cleanText += sub.cleanText;
      } else if (toolStart > 0) {
        const textBefore = buf.slice(0, toolStart).trim();
        if (textBefore) {
          if (writeStepId === -1) {
            const id = stepCounter++;
            writeStepId = id;
            ops.push({ action: "push", step: { id, kind: "writing", label: "Writing response…", status: "active", startedAt: Date.now() } });
          }
          cleanText = textBefore;
        }
        rawBuf = buf.slice(toolStart);
        phase = "in_tool";
        const sub = process("");
        ops.push(...sub.stepOps);
        cleanText += sub.cleanText;
      } else if (buf.length > 0) {
        if (writeStepId === -1) {
          const id = stepCounter++;
          writeStepId = id;
          ops.push({ action: "push", step: { id, kind: "writing", label: "Writing response…", status: "active", startedAt: Date.now() } });
        }
        cleanText = buf;
      }
      return { cleanText, stepOps: ops };
    }

    if (phase === "in_tool") {
      const nameMatch = buf.match(/<function=([^>]+)>/);
      const toolName = nameMatch?.[1] ?? "tool";
      if (toolStepId === -1) {
        const id = stepCounter++;
        toolStepId = id;
        ops.push({ action: "push", step: { id, kind: "tool", label: `Using tool: ${toolName}`, toolName, status: "active", startedAt: Date.now() } });
      }
      const toolEnd = buf.indexOf("</function>");
      const altEnd = buf.indexOf("</tool_call>");
      let endIdx = toolEnd !== -1 ? toolEnd + "</function>".length : altEnd !== -1 ? altEnd + "</tool_call>".length : -1;
      if (endIdx !== -1) {
        const cmdMatch = buf.match(/<parameter=(?:cmd|command|query|code|path)>([\s\S]*?)<\/parameter>/);
        ops.push({ action: "finish", id: toolStepId, detail: cmdMatch ? cmdMatch[1].trim() : buf.slice(0, 200) });
        toolStepId = -1;
        const after = buf.slice(endIdx).trimStart();
        if (after.startsWith("</tool_call>")) endIdx = buf.indexOf("</tool_call>", endIdx) + "</tool_call>".length;
        rawBuf = buf.slice(endIdx).trimStart();
        phase = "post_think";
        if (rawBuf) {
          const sub = process("");
          ops.push(...sub.stepOps);
          cleanText += sub.cleanText;
        }
      }
      return { cleanText, stepOps: ops };
    }

    if (phase === "writing") {
      const toolStart = buf.indexOf("<function=");
      if (toolStart === 0) {
        phase = "in_tool";
        const sub = process("");
        ops.push(...sub.stepOps);
        cleanText += sub.cleanText;
      } else if (toolStart > 0) {
        cleanText = buf.slice(0, toolStart).trim();
        rawBuf = buf.slice(toolStart);
        phase = "in_tool";
        const sub = process("");
        ops.push(...sub.stepOps);
        cleanText += sub.cleanText;
      } else {
        cleanText = buf;
      }
    }

    return { cleanText, stepOps: ops };
  }

  function reset() {
    rawBuf = "";
    stepCounter = 0;
    phase = "pre_think";
    thinkStepId = -1;
    toolStepId = -1;
    writeStepId = -1;
  }

  function getRawBuf() { return rawBuf; }

  return { process, reset, getRawBuf };
}

// ─── Code Block Extractor ───────────────────────────────────────────────────
// Replaces processCodeBlocks from TabChat (lines 804-905)

export function createCodeBlockExtractor(getStepCounter: () => number, setStepCounter: (n: number) => void) {
  let fullText = "";
  let inCodeBlock = false;
  let codeContent = "";
  let codeLang = "";
  let activeStepId = -1;
  let lastCommand = "";

  function process(newDelta: string): StepOp[] {
    const ops: StepOp[] = [];
    fullText += newDelta;
    const text = fullText;

    if (!inCodeBlock) {
      const searchFrom = Math.max(0, text.length - newDelta.length - 10);
      const openIdx = text.indexOf("```", searchFrom);
      if (openIdx !== -1 && openIdx >= searchFrom) {
        inCodeBlock = true;
        codeContent = "";

        const afterTicks = text.slice(openIdx + 3);
        const langMatch = afterTicks.match(/^(\w+)/);
        codeLang = langMatch ? langMatch[1] : "";

        const nlIdx = afterTicks.indexOf("\n");
        if (nlIdx !== -1) {
          codeContent = afterTicks.slice(nlIdx + 1);
        }

        const textBefore = text.slice(0, openIdx);
        const cmdMatch = textBefore.match(/`([^`]+)`[^`]*$/);
        if (cmdMatch) {
          lastCommand = cmdMatch[1];
        } else {
          const linesBefore = textBefore.split("\n").filter(l => l.trim());
          const lastLine = linesBefore[linesBefore.length - 1] || "";
          const cmdPattern = lastLine.match(/(?:output of|running|executing|command|ran)\s*:?\s*`?([^`:\n]+)`?/i);
          lastCommand = cmdPattern ? cmdPattern[1].trim() : "";
        }

        const isTerminal = !codeLang ||
          ["bash", "sh", "shell", "zsh", "terminal", "console", "cmd"].includes(codeLang.toLowerCase());
        const toolName = isTerminal ? "terminal" : "code_editor";
        const label = lastCommand
          ? lastCommand
          : (isTerminal ? "Terminal output" : `Code: ${codeLang}`);

        const id = getStepCounter();
        setStepCounter(id + 1);
        activeStepId = id;
        ops.push({
          action: "push",
          step: {
            id,
            kind: "tool",
            label,
            toolName,
            detail: codeContent.replace(/```[\s]*$/, "").trimEnd() || "executing…",
            status: "active" as StepStatus,
            startedAt: Date.now(),
          },
        });
      }
    } else {
      codeContent += newDelta;
      const closeIdx = codeContent.indexOf("```");
      if (closeIdx !== -1) {
        const finalContent = codeContent.slice(0, closeIdx).trimEnd();
        inCodeBlock = false;

        if (activeStepId !== -1) {
          const detail = lastCommand ? `${lastCommand}\n${finalContent}` : finalContent;
          ops.push({ action: "finish", id: activeStepId, detail });
          activeStepId = -1;
        }
        codeContent = "";
        codeLang = "";
        lastCommand = "";
      } else {
        if (activeStepId !== -1) {
          const currentContent = codeContent.trimEnd();
          const detail = lastCommand ? `${lastCommand}\n${currentContent}` : currentContent;
          ops.push({ action: "update_detail", id: activeStepId, detail });
        }
      }
    }

    return ops;
  }

  function reset() {
    fullText = "";
    inCodeBlock = false;
    codeContent = "";
    codeLang = "";
    activeStepId = -1;
    lastCommand = "";
  }

  return { process, reset };
}

// ─── Browser Extractor ──────────────────────────────────────────────────────
// Replaces processForBrowser from TabChat (lines 910-1001)

export function createBrowserExtractor(getSandboxId: () => string | null, apiBase = "") {
  let fullText = "";
  let scannedUpTo = 0;
  const seenUrls = new Set<string>();
  let browserState: BrowserWorkspaceState = createEmptyBrowserWorkspaceState();

  const normalizeUrl = (u: string) => u.replace(/[.),"'`]+$/, "").toLowerCase();

  function process(newDelta: string): { events: BrowserWorkspaceEvent[]; state: BrowserWorkspaceState } {
    fullText += newDelta;
    const events: BrowserWorkspaceEvent[] = [];

    const lastNl = fullText.lastIndexOf("\n");
    if (lastNl === -1) return { events, state: browserState };
    const endIdx = lastNl + 1;
    if (endIdx <= scannedUpTo) return { events, state: browserState };

    const completedText = fullText.slice(scannedUpTo, endIdx);
    scannedUpTo = endIdx;

    const addItem = (event: BrowserWorkspaceEvent, dedupeKey: string) => {
      const normalized = normalizeUrl(dedupeKey);
      if (seenUrls.has(normalized)) return;
      seenUrls.add(normalized);
      events.push(event);
      browserState = applyBrowserWorkspaceEvent(browserState, event);
    };

    let match;

    // 1. Markdown images
    const imgRegex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
    while ((match = imgRegex.exec(completedText)) !== null) {
      addItem({ type: "screenshot", url: match[2], label: match[1] || "Screenshot" }, match[2]);
    }

    // 2. Navigation verbs with https://
    const navRegex = /(?:navigat(?:ing|ed)\s+to|open(?:ing|ed)\s+|brows(?:ing|ed)\s+|visit(?:ing|ed)\s+|going\s+to|fetch(?:ing|ed)|loading)\s+`?(https?:\/\/[^\s`),>"]+)`?/gi;
    while ((match = navRegex.exec(completedText)) !== null) {
      const url = match[1].replace(/[.),"']+$/, "");
      addItem({ type: "navigation", url, label: url }, url);
    }

    // 2b. Bare domains
    const bareNavRegex = /(?:navigat(?:ing|ed)\s+to|open(?:ing|ed)\s+|brows(?:ing|ed)\s+|visit(?:ing|ed)\s+|going\s+to|fetch(?:ing|ed)|loading)\s+`?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+(?:\/[^\s`),>"]*)?)`?/gi;
    while ((match = bareNavRegex.exec(completedText)) !== null) {
      const raw = match[1].replace(/[.),"']+$/, "");
      if (/^https?:\/\//.test(raw)) continue;
      const url = `https://${raw}`;
      addItem({ type: "navigation", url, label: raw }, url);
    }

    // 3. URL references
    const urlRefRegex = /(?:visited\s+)?(?:URL|url|link|page|site|website|webpage)[\s:]+`?(https?:\/\/[^\s`),>"]+)`?/gi;
    while ((match = urlRefRegex.exec(completedText)) !== null) {
      const url = match[1].replace(/[.),"']+$/, "");
      addItem({ type: "navigation", url, label: url }, url);
    }

    // 4. Standalone URLs
    const standaloneUrlRegex = /(?:^|\n)\s*(?:\d+\.\s+)?(?:[^\n]*\n\s*)?`?(https?:\/\/[^\s`),>"]+)`?/gm;
    while ((match = standaloneUrlRegex.exec(completedText)) !== null) {
      const url = match[1].replace(/[.),"']+$/, "");
      addItem({ type: "navigation", url, label: url }, url);
    }

    // 5. Port announcements
    const portRegex = /(?:running|started|listening|available|serving)\s+(?:on|at)\s+(?:port\s+|:|\s*)(\d{4,5})/gi;
    while ((match = portRegex.exec(completedText)) !== null) {
      addItem(
        { type: "preview", url: `http://localhost:${match[1]}`, label: `localhost:${match[1]}` },
        `preview:${match[1]}`,
      );
    }

    // 6. Workspace file paths
    const WORKSPACE_PREFIX = "/root/.openclaw/workspace/";
    const wsPathRegex = /`?(\/root\/\.openclaw\/workspace\/[^\s`),>"]+\.(?:png|jpg|jpeg|gif|webp|svg))`?/gi;
    while ((match = wsPathRegex.exec(completedText)) !== null) {
      const containerPath = match[1].replace(/[.),"']+$/, "");
      const relativePath = containerPath.slice(WORKSPACE_PREFIX.length);
      const sid = getSandboxId();
      if (sid && relativePath) {
        const downloadUrl = `${apiBase}/api/sandboxes/${sid}/workspace/file/download?path=${encodeURIComponent(relativePath)}`;
        addItem({ type: "screenshot", url: downloadUrl, label: relativePath }, containerPath);
      }
    }

    return { events, state: browserState };
  }

  function reset() {
    fullText = "";
    scannedUpTo = 0;
    seenUrls.clear();
    browserState = createEmptyBrowserWorkspaceState();
  }

  function getState() { return browserState; }

  return { process, reset, getState };
}

// ─── Task Plan Extractor ────────────────────────────────────────────────────
// Replaces processTaskPlan from TabChat (lines 1007-1038)

export function createTaskPlanExtractor() {
  let fullText = "";
  let scannedLen = 0;
  let planClosed = false;
  let currentPlan: TaskPlan | null = null;

  function process(delta: string): TaskPlan | null {
    fullText += delta;

    if (!planClosed && fullText.includes("</plan>")) {
      planClosed = true;
    }

    const newText = fullText.slice(scannedLen);
    const updates = extractTaskUpdates(newText);

    if (currentPlan && planClosed) {
      if (updates.length > 0) {
        scannedLen = fullText.length;
        currentPlan = applyTaskUpdates(currentPlan, updates);
      }
    } else {
      const plan = parsePartialTaskPlanBlock(fullText) ?? parseMarkdownCheckboxList(fullText);
      if (plan) {
        scannedLen = fullText.length;
        currentPlan = updates.length > 0 ? applyTaskUpdates(plan, updates) : plan;
      }
    }

    return currentPlan;
  }

  function reset() {
    fullText = "";
    scannedLen = 0;
    planClosed = false;
    currentPlan = null;
  }

  function getPlan() { return currentPlan; }

  return { process, reset, getPlan };
}
