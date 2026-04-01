/**
 * OpenSpace skill evolution client.
 *
 * Analyzes completed chat executions for reusable patterns and proposes
 * skill capture/evolution. Writes execution logs to the sandbox for
 * OpenSpace to analyze, then reads back any evolved skills.
 *
 * All functions are fire-and-forget safe: they log on failure, never throw.
 */

import { getConfig } from './config';
import { dockerExec } from './docker';
import type { ExecutionSummary } from './chatPersistence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvolvedSkill {
  skillId: string;
  name: string;
  evolutionType: 'CAPTURED' | 'FIX' | 'DERIVED';
  version: number;
  skillDir: string;
}

export interface SkillAnalysisResult {
  executionRecorded: boolean;
  existingSkillCount: number;
  toolCallCount: number;
  evolvedSkills: EvolvedSkill[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if OpenSpace integration is enabled. */
export function isEnabled(): boolean {
  return getConfig().openspaceMcpEnabled;
}

/**
 * Record a completed chat execution to the sandbox for skill analysis.
 *
 * Writes a structured execution log to /root/agent/.execution-logs/
 * inside the container. OpenSpace's post-execution analyzer reads these
 * logs to identify reusable patterns and propose skill evolution.
 *
 * This is the core learning loop:
 *   Chat completes → execution recorded → OpenSpace analyzes → skills evolve
 */
export async function recordAndAnalyzeExecution(
  sandboxId: string,
  execution: ExecutionSummary,
): Promise<SkillAnalysisResult | null> {
  if (!isEnabled()) return null;
  if (execution.totalToolCalls === 0) return null; // Nothing to learn from

  try {
    // 1. Ensure the execution log directory exists
    await dockerExec(sandboxId, 'mkdir -p /root/agent/.execution-logs');

    // 2. Write the execution log as structured JSON
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = `/root/agent/.execution-logs/${timestamp}.json`;
    const logContent = JSON.stringify({
      timestamp: new Date().toISOString(),
      toolCalls: execution.toolCalls,
      totalToolCalls: execution.totalToolCalls,
      responseLength: execution.responseContent.length,
      // Truncate response to avoid huge files — keep first 2000 chars for pattern detection
      responseSummary: execution.responseContent.slice(0, 2000),
    });

    // Escape for shell safely
    const escaped = logContent.replace(/'/g, "'\\''");
    const [writeOk] = await dockerExec(
      sandboxId,
      `echo '${escaped}' > ${logPath}`,
    );

    if (!writeOk) {
      console.warn('[openspace] Failed to write execution log');
      return null;
    }

    // 3. Count existing skills for context
    const [, skillsOutput] = await dockerExec(
      sandboxId,
      `ls /root/agent/skills/ 2>/dev/null | wc -l`,
    );
    const existingSkillCount = parseInt(skillsOutput.trim(), 10) || 0;

    // 4. Count total execution logs to track learning progress
    const [, logCountOutput] = await dockerExec(
      sandboxId,
      `ls /root/agent/.execution-logs/*.json 2>/dev/null | wc -l`,
    );
    const executionLogCount = parseInt(logCountOutput.trim(), 10) || 0;

    // 5. Check for repeating tool patterns across recent executions
    //    This is the lightweight heuristic that triggers skill proposal
    const evolvedSkills = await detectRepeatablePatterns(sandboxId);

    console.info(
      `[openspace] Execution recorded for sandbox ${sandboxId}: ` +
      `${execution.totalToolCalls} tool calls, ` +
      `${existingSkillCount} existing skills, ` +
      `${executionLogCount} total logs, ` +
      `${evolvedSkills.length} patterns detected`,
    );

    return {
      executionRecorded: true,
      existingSkillCount,
      toolCallCount: execution.totalToolCalls,
      evolvedSkills,
    };
  } catch (err) {
    console.warn('[openspace] Execution recording failed:', (err as Error).message);
    return null;
  }
}

/**
 * Detect repeatable tool-call patterns across recent execution logs.
 *
 * Reads the last N execution logs, extracts tool-call sequences, and
 * identifies patterns that appear 3+ times — these are candidates for
 * skill capture. Returns proposed skills with CAPTURED evolution type.
 *
 * This is the lightweight heuristic. Full LLM-powered analysis will
 * be added when OpenSpace MCP is directly integrated into the sandbox.
 */
async function detectRepeatablePatterns(sandboxId: string): Promise<EvolvedSkill[]> {
  try {
    // Read recent execution logs (last 10)
    const [ok, logsRaw] = await dockerExec(
      sandboxId,
      `for f in $(ls -t /root/agent/.execution-logs/*.json 2>/dev/null | head -10); do cat "$f"; echo "---SEPARATOR---"; done`,
    );
    if (!ok || !logsRaw.trim()) return [];

    const logs = logsRaw.split('---SEPARATOR---')
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        try { return JSON.parse(block); }
        catch { return null; }
      })
      .filter((log): log is Record<string, unknown> => log !== null);

    if (logs.length < 3) return []; // Need at least 3 executions to detect patterns

    // Extract tool sequences from each log
    const sequences = logs.map((log) => {
      const calls = Array.isArray(log.toolCalls) ? log.toolCalls : [];
      return calls
        .map((c: Record<string, unknown>) => typeof c.tool === 'string' ? c.tool : '')
        .filter(Boolean)
        .join(' → ');
    });

    // Count repeating sequences
    const counts = new Map<string, number>();
    for (const seq of sequences) {
      if (!seq) continue;
      counts.set(seq, (counts.get(seq) ?? 0) + 1);
    }

    // Propose skills for patterns appearing 3+ times
    const proposals: EvolvedSkill[] = [];
    for (const [sequence, count] of counts) {
      if (count >= 3) {
        const tools = sequence.split(' → ');
        const skillName = tools.slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
        proposals.push({
          skillId: `captured-${skillName}-${Date.now()}`,
          name: `${tools[0]} workflow (${tools.length} steps)`,
          evolutionType: 'CAPTURED',
          version: 1,
          skillDir: `/root/agent/skills/${skillName}`,
        });
      }
    }

    return proposals;
  } catch {
    return [];
  }
}

/**
 * Search for existing skills in the sandbox.
 */
export async function listSkills(sandboxId: string): Promise<string[]> {
  if (!isEnabled()) return [];

  try {
    const [ok, result] = await dockerExec(
      sandboxId,
      `ls /root/agent/skills/ 2>/dev/null || echo ""`,
    );
    if (!ok) return [];
    return result
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
