import { Worker, type Job } from 'bullmq';
import { spawn } from 'bun';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type LearningJobData, type EvolutionJobData, type IngestionJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import * as scoreStore from '../stores/scoreStore';
import * as agentStore from '../stores/agentStore';
import { recordSuccess, recordFailure } from '../circuitBreaker';
import { query } from '../db';
import { learning as log } from '../logger';

// ── Evolution Thresholds (more aggressive) ────────────────────
const FAILURE_THRESHOLD = 2;          // 2 failures in 24h triggers evolution (was 2, now explicit)
const PASS_RATE_THRESHOLD = 80;       // below 80% triggers evolution (was 60%)
const SLOW_TASK_MULTIPLIER = 3;       // 3x slower than agent's median = performance issue
const MIN_TASKS_FOR_PERF = 3;         // need at least 3 tasks before measuring performance

/**
 * Store a learning in ChromaDB cold memory.
 */
async function storeMemory(text: string, type: string, agent: string, tags: string): Promise<void> {
  const config = getConfig();
  const scriptPath = path.join(config.projectRoot, '.claude', 'scripts', 'memory-store.py');
  if (!fs.existsSync(scriptPath)) return;

  try {
    const proc = spawn({
      cmd: ['python3', scriptPath, text, '--type', type, '--agent', agent, '--tags', tags],
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: config.projectRoot,
    });
    await proc.exited;
  } catch {
    log.warn({ text: text.slice(0, 60) }, 'Failed to store memory');
  }
}

// ── Rich Output Parsing ───────────────────────────────────────

interface ExtractedLearning {
  filesRead: string[];
  filesEdited: string[];
  toolsUsed: string[];
  errorsEncountered: string[];
  taskSummary: string;
  taskType: string;           // 'code-change', 'test-run', 'review', 'analysis', 'debugging'
  qualitySignals: string[];   // things that indicate quality of output
  selfReportedLearnings: Array<{ type: string; description: string }>;  // LEARNING: markers
  selfReportedSkills: string[];   // SKILL_ACQUIRED: markers
  selfReportedGaps: string[];     // GAP: markers
}

/**
 * Parse the raw Claude output and extract structured learnings.
 */
function extractLearnings(output: string | null, error: string | null, success: boolean): ExtractedLearning {
  const learning: ExtractedLearning = {
    filesRead: [],
    filesEdited: [],
    toolsUsed: [],
    errorsEncountered: [],
    taskSummary: '',
    taskType: 'unknown',
    qualitySignals: [],
    selfReportedLearnings: [],
    selfReportedSkills: [],
    selfReportedGaps: [],
  };

  if (!output) return learning;

  // Try to parse as JSON first (--output-format json wraps it)
  let resultText = output;
  try {
    const parsed = JSON.parse(output);
    resultText = parsed.result || parsed.content || output;

    // Extract usage info
    if (parsed.usage) {
      const turns = parsed.num_turns || 0;
      learning.qualitySignals.push(`${turns} turns`);
      if (parsed.usage.output_tokens) {
        learning.qualitySignals.push(`${parsed.usage.output_tokens} output tokens`);
      }
    }
  } catch { /* not JSON, use raw */ }

  // Extract file paths mentioned (common patterns)
  const filePatterns = resultText.match(/(?:(?:Read|Edit|Write|Created|Modified|Updated|Deleted)\s+)?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,6})[`"]?/g);
  if (filePatterns) {
    for (const match of filePatterns) {
      const filePath = match.replace(/^(Read|Edit|Write|Created|Modified|Updated|Deleted)\s+/, '').replace(/[`"]/g, '').trim();
      if (filePath.includes('/') || filePath.includes('.ts') || filePath.includes('.tsx')) {
        if (match.match(/^(Edit|Write|Created|Modified|Updated)/i)) {
          learning.filesEdited.push(filePath);
        } else {
          learning.filesRead.push(filePath);
        }
      }
    }
  }

  // Extract tools used
  const toolMentions = resultText.match(/\b(Read|Edit|Write|Grep|Glob|Bash|Agent)\b/g);
  if (toolMentions) {
    learning.toolsUsed = [...new Set(toolMentions)];
  }

  // Extract errors
  if (error) {
    learning.errorsEncountered.push(error.slice(0, 200));
  }
  const errorPatterns = resultText.match(/(?:error|Error|ERROR|failed|Failed|FAILED)[:]\s*([^\n]{10,100})/g);
  if (errorPatterns) {
    for (const e of errorPatterns.slice(0, 3)) {
      learning.errorsEncountered.push(e.slice(0, 150));
    }
  }

  // Determine task type
  const text = resultText.toLowerCase();
  if (text.includes('test') && (text.includes('coverage') || text.includes('jest') || text.includes('passing'))) {
    learning.taskType = 'test-run';
  } else if (learning.filesEdited.length > 0) {
    learning.taskType = 'code-change';
  } else if (text.includes('review') || text.includes('convention') || text.includes('compliance')) {
    learning.taskType = 'review';
  } else if (text.includes('debug') || text.includes('investigate') || text.includes('fix')) {
    learning.taskType = 'debugging';
  } else {
    learning.taskType = 'analysis';
  }

  // Extract a summary (first meaningful sentence of the result)
  const sentences = resultText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 200);
  learning.taskSummary = sentences[0] || resultText.slice(0, 150);

  // Quality signals
  if (learning.filesEdited.length > 0) learning.qualitySignals.push(`edited ${learning.filesEdited.length} files`);
  if (learning.filesRead.length > 0) learning.qualitySignals.push(`read ${learning.filesRead.length} files`);
  if (success && learning.errorsEncountered.length === 0) learning.qualitySignals.push('clean execution');

  // ── Parse self-evolution markers from agent output ──────────
  // Agents emit structured markers: LEARNING, SKILL_ACQUIRED, GAP
  const learningMarkers = resultText.match(/LEARNING:\s*(\w+)\s*\|\s*([^\n]+)/g);
  if (learningMarkers) {
    for (const m of learningMarkers) {
      const match = m.match(/LEARNING:\s*(\w+)\s*\|\s*(.+)/);
      if (match) {
        learning.selfReportedLearnings.push({ type: match[1].toLowerCase(), description: match[2].trim() });
      }
    }
  }

  const skillMarkers = resultText.match(/SKILL_ACQUIRED:\s*([^\n]+)/g);
  if (skillMarkers) {
    for (const m of skillMarkers) {
      const desc = m.replace(/^SKILL_ACQUIRED:\s*/, '').trim();
      if (desc) learning.selfReportedSkills.push(desc);
    }
  }

  const gapMarkers = resultText.match(/GAP:\s*([^\n]+)/g);
  if (gapMarkers) {
    for (const m of gapMarkers) {
      const desc = m.replace(/^GAP:\s*/, '').trim();
      if (desc) learning.selfReportedGaps.push(desc);
    }
  }

  // Deduplicate
  learning.filesRead = [...new Set(learning.filesRead)].slice(0, 10);
  learning.filesEdited = [...new Set(learning.filesEdited)].slice(0, 10);

  return learning;
}

// ── Performance Analysis ──────────────────────────────────────

/**
 * Check if this task was unusually slow compared to the agent's median.
 */
async function checkPerformance(agentName: string, durationMs: number): Promise<{ slow: boolean; medianMs: number; ratio: number }> {
  const result = await query(
    `SELECT
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_ms,
       COUNT(*) as task_count
     FROM task_logs
     WHERE delegated_to = $1
     AND status = 'completed'
     AND duration_ms IS NOT NULL
     AND created_at > NOW() - INTERVAL '7 days'`,
    [agentName],
  );

  const medianMs = Number(result.rows[0]?.median_ms || 0);
  const taskCount = Number(result.rows[0]?.task_count || 0);

  if (taskCount < MIN_TASKS_FOR_PERF || medianMs === 0) {
    return { slow: false, medianMs: 0, ratio: 0 };
  }

  const ratio = durationMs / medianMs;
  return { slow: ratio >= SLOW_TASK_MULTIPLIER, medianMs, ratio: Math.round(ratio * 10) / 10 };
}

/**
 * Check pass rate for an agent — triggers evolution if below threshold.
 */
async function checkPassRate(agentName: string): Promise<{ needsEvolution: boolean; passRate: number; total: number }> {
  const result = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE passed = true) as passed
     FROM agent_scores
     WHERE agent_name = $1
     AND created_at > NOW() - INTERVAL '7 days'`,
    [agentName],
  );

  const total = Number(result.rows[0]?.total || 0);
  const passed = Number(result.rows[0]?.passed || 0);

  if (total < 3) return { needsEvolution: false, passRate: 100, total };

  const passRate = Math.round((passed / total) * 100);
  return { needsEvolution: passRate < PASS_RATE_THRESHOLD, passRate, total };
}

/**
 * Check for any failures in 24h (lowered from consecutive-only).
 */
async function checkRecentFailures(agentName: string): Promise<{ needsEvolution: boolean; failCount: number }> {
  const result = await query(
    `SELECT COUNT(*) as cnt FROM agent_scores
     WHERE agent_name = $1 AND passed = false
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [agentName],
  );
  const failCount = parseInt(String(result.rows[0]?.cnt || '0'), 10);
  return { needsEvolution: failCount >= FAILURE_THRESHOLD, failCount };
}

// ── Skill Acquisition Detection ───────────────────────────────

/**
 * Detect if this task represents a new capability for the agent.
 * Checks if the agent has successfully done this task type before.
 */
async function detectNewSkill(agentName: string, taskType: string, description: string): Promise<string | null> {
  // Check if agent has handled this type before
  const result = await query(
    `SELECT COUNT(*) as cnt FROM memories
     WHERE agent = $1
     AND type = 'skill'
     AND tags LIKE $2
     AND created_at > NOW() - INTERVAL '30 days'`,
    [agentName, `%${taskType}%`],
  );

  const existing = parseInt(String(result.rows[0]?.cnt || '0'), 10);

  if (existing === 0) {
    // This is a new skill for this agent
    return `${taskType}: ${description.slice(0, 80)}`;
  }

  return null;
}

// ── Main Worker ───────────────────────────────────────────────

export function createLearningWorker(): Worker<LearningJobData> {
  const worker = new Worker<LearningJobData>(
    QUEUE_NAMES.LEARNING,
    async (job: Job<LearningJobData>) => {
      const { taskLogId, queueJobId, agentName, success, output, error, durationMs, filesChanged } = job.data;
      log.info({ agentName, success, taskLogId }, 'Processing learning');

      // ── 1. Rich extraction ──────────────────────────────────
      const learning = extractLearnings(output, error, success);

      // Score with more nuance (not just 8 or 2)
      let score: number;
      if (success) {
        score = 7; // base
        if (learning.filesEdited.length > 0) score += 1;       // actually changed code
        if (learning.errorsEncountered.length === 0) score += 1; // clean
        if (learning.qualitySignals.includes('clean execution')) score += 1;
        score = Math.min(score, 10);
      } else {
        score = 3; // base
        if (error?.includes('Timed out')) score = 2;  // timeout is worse
        if (error?.includes('SIGKILL')) score = 1;     // killed is worst
      }

      const richNotes = success
        ? `[${learning.taskType}] ${learning.taskSummary.slice(0, 100)} | ${learning.qualitySignals.join(', ')} | ${durationMs}ms`
        : `[${learning.taskType}] FAILED: ${(error || 'unknown').slice(0, 100)} | ${durationMs}ms`;

      await scoreStore.createScore({
        agentName,
        taskId: taskLogId,
        passed: success,
        score,
        notes: richNotes,
      });

      await agentStore.incrementAgentScore(agentName, success);

      // ── 2. Circuit breaker ──────────────────────────────────
      if (success) {
        await recordSuccess(agentName);
      } else {
        const { tripped } = await recordFailure(agentName);
        if (tripped) {
          log.warn({ agentName }, 'Circuit breaker TRIPPED');
        }
      }

      // ── 2b. Quality review feedback loop ───────────────────
      // If this was a quality-review task, extract the reviewed agent name
      // and store the quality score as feedback for that agent's evolution
      const { description: taskDesc } = job.data;
      if (taskDesc && taskDesc.startsWith('[quality-review]') && success) {
        const reviewedAgentMatch = taskDesc.match(/changes made by (\w+):/);
        if (reviewedAgentMatch) {
          const reviewedAgent = reviewedAgentMatch[1];
          // Extract quality score from the reviewer's output if possible
          const qualityMatch = learning.taskSummary.match(/(\d+)\s*\/\s*10/);
          const qualityScore = qualityMatch ? parseInt(qualityMatch[1], 10) : null;

          if (qualityScore !== null) {
            // Store a quality score for the reviewed agent (separate from pass/fail)
            await scoreStore.createScore({
              agentName: reviewedAgent,
              taskId: taskLogId,
              passed: qualityScore >= 6,
              score: qualityScore,
              notes: `Quality review by reviewer: ${learning.taskSummary.slice(0, 100)}`,
            });

            log.info({ reviewedAgent, qualityScore }, 'Quality feedback received');

            // If quality is low, store a pitfall for the reviewed agent
            if (qualityScore < 6) {
              await storeMemory(
                `Quality review flagged ${reviewedAgent}'s code: score ${qualityScore}/10. ${learning.taskSummary.slice(0, 150)}`,
                'pitfall',
                reviewedAgent,
                `quality-review,${reviewedAgent},low-quality`,
              );
            }
          }
        }
      }

      // ── 3. Rich memory storage ──────────────────────────────
      if (success) {
        // Store what the agent actually did (not just "completed in Xms")
        const actionSummary = [
          learning.taskSummary,
          learning.filesEdited.length > 0 ? `Files edited: ${learning.filesEdited.join(', ')}` : null,
          learning.toolsUsed.length > 0 ? `Tools: ${learning.toolsUsed.join(', ')}` : null,
        ].filter(Boolean).join('. ');

        await storeMemory(
          actionSummary,
          'pattern',
          agentName,
          `${learning.taskType},${agentName},success`,
        );

        // ── 4. Skill acquisition ────────────────────────────────
        const newSkill = await detectNewSkill(agentName, learning.taskType, learning.taskSummary);
        if (newSkill) {
          await storeMemory(
            `New skill acquired: ${newSkill}`,
            'skill',
            agentName,
            `skill,${learning.taskType},${agentName},acquired`,
          );

          // Also store in PostgreSQL memories for structured queries
          await query(
            `INSERT INTO memories (id, text, type, agent, tags, task_context)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuidv4(), `Skill acquired: ${newSkill}`, 'skill', agentName,
             `skill,${learning.taskType},acquired`, taskLogId],
          );

          log.info({ agentName, skill: newSkill }, 'New skill acquired');
          publish({ type: 'memory', action: 'created', data: { type: 'skill-acquired', agentName, skill: newSkill } });
        }
      } else {
        // Store failure details richly
        const failureSummary = [
          `Failed task type: ${learning.taskType}`,
          error ? `Error: ${error.slice(0, 200)}` : null,
          learning.errorsEncountered.length > 0 ? `Errors: ${learning.errorsEncountered.join('; ')}` : null,
        ].filter(Boolean).join('. ');

        await storeMemory(
          failureSummary,
          'pitfall',
          agentName,
          `${learning.taskType},${agentName},failure`,
        );
      }

      // ── 3b. Process self-reported evolution markers ────────────
      // Agents emit LEARNING:, SKILL_ACQUIRED:, GAP: markers in their output

      for (const lr of learning.selfReportedLearnings) {
        await storeMemory(lr.description, lr.type, agentName, `${lr.type},self-reported,${agentName}`);
        await query(
          `INSERT INTO memories (id, text, type, agent, tags, task_context) VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), `Self-reported ${lr.type}: ${lr.description}`, lr.type, agentName,
           `${lr.type},self-reported`, taskLogId],
        );
      }

      for (const skill of learning.selfReportedSkills) {
        await storeMemory(`Skill acquired: ${skill}`, 'skill', agentName, `skill,self-reported,${agentName}`);
        await query(
          `INSERT INTO memories (id, text, type, agent, tags, task_context) VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), `Skill acquired: ${skill}`, 'skill', agentName, 'skill,self-reported,acquired', taskLogId],
        );
        log.info({ agentName, skill }, 'Self-reported skill');
        publish({ type: 'memory', action: 'created', data: { type: 'skill-acquired', agentName, skill } });
      }

      for (const gap of learning.selfReportedGaps) {
        await storeMemory(`Capability gap: ${gap}`, 'gap', agentName, `gap,self-reported,${agentName}`);
        await query(
          `INSERT INTO memories (id, text, type, agent, tags, task_context) VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), `Gap: ${gap}`, 'gap', agentName, 'gap,self-reported', taskLogId],
        );
        log.info({ agentName, gap }, 'Self-reported gap');
      }

      if (learning.selfReportedLearnings.length + learning.selfReportedSkills.length + learning.selfReportedGaps.length > 0) {
        log.info({ agentName, learnings: learning.selfReportedLearnings.length, skills: learning.selfReportedSkills.length, gaps: learning.selfReportedGaps.length }, 'Self-evolution markers processed');
      }

      // Store structured learning in PostgreSQL
      await query(
        `INSERT INTO memories (id, text, type, agent, tags, task_context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), richNotes, success ? 'pattern' : 'pitfall', agentName,
         `${learning.taskType},execution,${success ? 'success' : 'failure'}`, taskLogId],
      );

      // ── 5. Evolution triggers (more aggressive) ─────────────
      let evolutionTriggered = false;

      if (!success) {
        // Check: 2+ failures in 24h (any, not just consecutive)
        const { needsEvolution, failCount } = await checkRecentFailures(agentName);
        if (needsEvolution) {
          log.info({ agentName, failCount }, 'Failures in 24h — triggering evolution');
          await getQueue(QUEUE_NAMES.EVOLUTION).add('refine', {
            type: 'refine-agent',
            agentName,
            failureContext: `${failCount} failures in 24h. Latest: ${(error || '').slice(0, 300)}`,
            trigger: 'event',
          } satisfies EvolutionJobData, { priority: 3 });
          evolutionTriggered = true;
        }
      }

      // Check: pass rate below 80% (regardless of success/failure)
      if (!evolutionTriggered) {
        const { needsEvolution, passRate, total } = await checkPassRate(agentName);
        if (needsEvolution) {
          log.info({ agentName, passRate, total }, 'Pass rate below threshold — triggering evolution');
          await getQueue(QUEUE_NAMES.EVOLUTION).add('refine', {
            type: 'refine-agent',
            agentName,
            failureContext: `Pass rate ${passRate}% over ${total} tasks in 7 days`,
            trigger: 'event',
          } satisfies EvolutionJobData, { priority: 5 });
          evolutionTriggered = true;
        }
      }

      // Check: performance regression (task took 3x+ longer than median)
      if (success && !evolutionTriggered) {
        const perf = await checkPerformance(agentName, durationMs);
        if (perf.slow) {
          log.info({ agentName, ratio: perf.ratio, medianMs: perf.medianMs }, 'Slow task — storing performance warning');
          await storeMemory(
            `Performance warning: ${agentName} took ${Math.round(durationMs / 1000)}s (${perf.ratio}x median of ${Math.round(perf.medianMs / 1000)}s)`,
            'pitfall',
            agentName,
            `performance,slow,${agentName}`,
          );
        }
      }

      // ── 6. Quality review for code changes ─────────────────
      // If the agent made code changes, queue a lightweight reviewer pass
      if (success && learning.taskType === 'code-change' && learning.filesEdited.length > 0 && agentName !== 'reviewer') {
        const { description: taskDesc } = job.data;
        await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
          description: `[quality-review] Review changes made by ${agentName}: ${(taskDesc || '').slice(0, 100)}. Files: ${learning.filesEdited.slice(0, 5).join(', ')}. Check for: correctness, convention compliance, missing tests, security issues. Output a quality score 1-10 with brief notes.`,
          source: 'self',
          agentName: 'reviewer',
          priority: 8, // low priority — background quality check
        } satisfies IngestionJobData);
        log.info({ agentName }, 'Queued quality review for code changes');
      }

      publish({ type: 'score', action: 'created', data: { agentName, passed: success, score, taskLogId, taskType: learning.taskType } });

      log.info({ agentName, passed: success, score, taskType: learning.taskType, qualitySignals: learning.qualitySignals }, 'Scoring complete');
      return { agentName, success, score, taskType: learning.taskType, newSkill: !!learning.filesEdited.length };
    },
    {
      connection: getRedis(),
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.LEARNING],
    },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'Job failed');
  });

  return worker;
}
