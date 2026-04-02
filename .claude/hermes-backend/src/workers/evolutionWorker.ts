import { Worker, type Job } from 'bullmq';
import { spawn } from 'bun';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type EvolutionJobData, type FactoryJobData, type IngestionJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import { query } from '../db';

/**
 * Query agent performance trends from PostgreSQL.
 */
async function getAgentTrends(): Promise<Array<{
  agentName: string;
  recentTotal: number;
  recentPassed: number;
  recentFailed: number;
  passRate: number;
  failStreak: number;
}>> {
  const result = await query(`
    SELECT
      agent_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE passed = true) as passed,
      COUNT(*) FILTER (WHERE passed = false) as failed
    FROM agent_scores
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY agent_name
    ORDER BY failed DESC
  `);

  const trends = [];
  for (const row of result.rows) {
    const total = Number(row.total);
    const passed = Number(row.passed);
    const failed = Number(row.failed);

    // Check fail streak (consecutive recent failures)
    const streakResult = await query(`
      SELECT passed FROM agent_scores
      WHERE agent_name = $1
      ORDER BY created_at DESC LIMIT 5
    `, [row.agent_name]);

    let failStreak = 0;
    for (const s of streakResult.rows) {
      if (!s.passed) failStreak++;
      else break;
    }

    trends.push({
      agentName: String(row.agent_name),
      recentTotal: total,
      recentPassed: passed,
      recentFailed: failed,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 100,
      failStreak,
    });
  }
  return trends;
}

/**
 * Find task types that have no matching specialist (routed to hermes by default).
 */
async function findGaps(): Promise<string[]> {
  const result = await query(`
    SELECT description FROM task_logs
    WHERE delegated_to = 'hermes'
    AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  return result.rows.map(r => String(r.description));
}

/**
 * Run scheduled evolution analysis.
 */
async function runScheduledAnalysis(): Promise<Record<string, unknown>> {
  console.log('[hermes:evolution] Running scheduled analysis...');

  const trends = await getAgentTrends();
  const gaps = await findGaps();
  const actions: Array<{ type: string; agent?: string; description: string }> = [];

  // Check for declining agents (lowered thresholds: 2 streak or <80% pass rate)
  for (const trend of trends) {
    if (trend.failStreak >= 2 || trend.passRate < 80) {
      console.log(`[hermes:evolution] Agent ${trend.agentName} needs refinement (pass rate: ${trend.passRate}%, streak: ${trend.failStreak})`);

      await getQueue(QUEUE_NAMES.EVOLUTION).add('refine', {
        type: 'refine-agent',
        agentName: trend.agentName,
        failureContext: `Pass rate ${trend.passRate}%, fail streak ${trend.failStreak}`,
        trigger: 'scheduled',
      } satisfies EvolutionJobData, { priority: 5 });

      actions.push({
        type: 'refine-triggered',
        agent: trend.agentName,
        description: `Triggered refinement: pass rate ${trend.passRate}%, fail streak ${trend.failStreak}`,
      });
    }
  }

  // Check for self-reported gaps from agents (LEARNING markers)
  const selfGapsResult = await query(`
    SELECT text, agent FROM memories
    WHERE type = 'gap' AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at DESC LIMIT 10
  `);
  if (selfGapsResult.rows.length >= 2) {
    const gapTexts = selfGapsResult.rows.map(r => `[${r.agent}] ${r.text}`);
    console.log(`[hermes:evolution] ${selfGapsResult.rows.length} self-reported gaps from agents`);
    actions.push({
      type: 'gaps-detected',
      description: `${selfGapsResult.rows.length} self-reported capability gaps: ${gapTexts.slice(0, 3).join('; ')}`,
    });
  }

  // Check for gaps (tasks consistently routed to hermes — lowered from 5 to 3)
  if (gaps.length >= 3) {
    const gapSummary = gaps.slice(0, 5).join('; ');
    console.log(`[hermes:evolution] Gap detected: ${gaps.length} tasks routed to hermes`);

    await getQueue(QUEUE_NAMES.FACTORY).add('create', {
      gapDescription: `${gaps.length} tasks in the last 7 days were routed to hermes (no specialist). Examples: ${gapSummary}`,
      recentTasks: gaps.slice(0, 10),
      trigger: 'evolution',
    } satisfies FactoryJobData, { priority: 5 });

    actions.push({
      type: 'factory-triggered',
      description: `${gaps.length} tasks with no specialist — triggered agent factory`,
    });
  }

  // Store evolution report
  const report = {
    trends,
    gapsCount: gaps.length,
    actions,
    analyzedAt: new Date().toISOString(),
  };

  await query(
    `INSERT INTO evolution_reports (id, report_type, summary, details, actions_taken, trigger)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      'analysis',
      `Analyzed ${trends.length} agents, found ${actions.length} actions needed`,
      JSON.stringify(report),
      JSON.stringify(actions),
      'scheduled',
    ],
  );

  return report;
}

/**
 * Refine a specific agent by analyzing its failures and proposing prompt edits.
 */
async function refineAgent(agentName: string, failureContext?: string): Promise<Record<string, unknown>> {
  const config = getConfig();
  const agentPath = path.join(config.agentsDir, `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    console.warn(`[hermes:evolution] Agent file not found: ${agentPath}`);
    return { refined: false, reason: 'Agent file not found' };
  }

  // Read current agent prompt
  const currentPrompt = fs.readFileSync(agentPath, 'utf-8');

  // Gather recent failures for this agent
  const failures = await query(
    `SELECT tl.description, tl.error, tl.result_summary
     FROM task_logs tl
     JOIN agent_scores s ON s.task_id = tl.id
     WHERE s.agent_name = $1 AND s.passed = false
     AND s.created_at > NOW() - INTERVAL '7 days'
     ORDER BY s.created_at DESC LIMIT 5`,
    [agentName],
  );

  if (failures.rows.length === 0) {
    return { refined: false, reason: 'No recent failures found' };
  }

  const failureDetails = failures.rows
    .map(r => `- Task: ${r.description}\n  Error: ${r.error || 'none'}`)
    .join('\n');

  // Spawn Claude (hermes) to analyze and propose refinement
  const refinementPrompt = `You are analyzing agent "${agentName}" which has been failing.

## Current Agent Prompt
\`\`\`
${currentPrompt}
\`\`\`

## Recent Failures
${failureDetails}

## Additional Context
${failureContext || 'None'}

## Your Task
1. Identify what's missing from the agent's prompt that causes these failures
2. Write the COMPLETE updated agent prompt file (including frontmatter)
3. Output ONLY the updated file content, nothing else

Be surgical — add the minimum instructions needed to prevent these specific failures. Do not remove existing instructions.`;

  const hermesPath = path.join(config.agentsDir, 'hermes.md');
  const proc = spawn({
    cmd: [config.claudeCliPath, '--agent', hermesPath, '--print', '--dangerously-skip-permissions'],
    stdin: new Blob([refinementPrompt]),
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: config.projectRoot,
  });

  const exitCode = await proc.exited;
  const output = await new Response(proc.stdout).text();

  if (exitCode !== 0 || !output.trim()) {
    return { refined: false, reason: 'Refinement subprocess failed' };
  }

  // Backup and write the refined prompt
  const backupPath = `${agentPath}.bak`;
  fs.copyFileSync(agentPath, backupPath);
  fs.writeFileSync(agentPath, output.trim());

  // Log refinement
  await query(
    `INSERT INTO refinements (id, agent_name, change_description, reason, diff_summary)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      uuidv4(),
      agentName,
      `Auto-refined after ${failures.rows.length} recent failures`,
      failureContext || `Pass rate dropped below threshold`,
      `Backup at ${backupPath}`,
    ],
  );

  // Increment agent version
  await query(
    `UPDATE agents SET version = version + 1, updated_at = NOW() WHERE name = $1`,
    [agentName],
  );

  // Schedule a test task to verify the refinement
  await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
    description: `[evolution-test] Verify refinement of ${agentName}: run a simple task to check the agent works correctly after prompt update`,
    source: 'self',
    agentName,
    priority: 3,
  } satisfies IngestionJobData);

  // Store evolution report
  await query(
    `INSERT INTO evolution_reports (id, report_type, summary, details, actions_taken, trigger)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      'refinement',
      `Refined ${agentName} after ${failures.rows.length} failures`,
      JSON.stringify({ agentName, failureCount: failures.rows.length, failureContext }),
      JSON.stringify([{ type: 'agent-refined', agent: agentName, description: 'Prompt updated, test scheduled' }]),
      'event',
    ],
  );

  publish({ type: 'refinement', action: 'created', data: { agentName, reason: failureContext } });

  console.log(`[hermes:evolution] Refined ${agentName} — test task scheduled`);
  return { refined: true, agentName, failureCount: failures.rows.length };
}

/**
 * Run memory maintenance — prune MEMORY.md, check distribution.
 */
async function runMemoryMaintenance(): Promise<Record<string, unknown>> {
  const config = getConfig();
  const memoryPath = path.join(config.projectRoot, '.claude', 'MEMORY.md');

  let lineCount = 0;
  let pruned = false;

  if (fs.existsSync(memoryPath)) {
    const content = fs.readFileSync(memoryPath, 'utf-8');
    lineCount = content.split('\n').length;
    // Pruning is done by Hermes agent itself — we just report
    pruned = false;
  }

  // Check memory distribution
  const stats = await query(`
    SELECT type, COUNT(*) as cnt FROM memories GROUP BY type ORDER BY cnt DESC
  `);

  const distribution = Object.fromEntries(
    stats.rows.map(r => [r.type, Number(r.cnt)]),
  );

  // Curate hot memory (MEMORY.md) from cold storage
  const { curateHotMemory } = await import('../hotMemoryCurator');
  const hotMemoryResult = await curateHotMemory();
  lineCount = hotMemoryResult.lines;

  // Clean up stale running tasks (stuck for more than 2 hours)
  const staleResult = await query(`
    UPDATE task_logs
    SET status = 'failed', error = 'Stale task — stuck running for over 2 hours, auto-cleaned by maintenance'
    WHERE status = 'running'
    AND created_at < NOW() - INTERVAL '2 hours'
    RETURNING id, delegated_to
  `);
  const staleCleaned = staleResult.rows.length;
  if (staleCleaned > 0) {
    console.log(`[hermes:evolution] Cleaned ${staleCleaned} stale running tasks`);
    for (const row of staleResult.rows) {
      await query('UPDATE agents SET tasks_failed = tasks_failed + 1 WHERE name = $1', [row.delegated_to]);
    }
  }

  // Run skill acquisition sweep — write learned skills back to agent .md files
  const { runSkillAcquisitionSweep } = await import('../skillAcquisition');
  const skillResult = await runSkillAcquisitionSweep();

  await query(
    `INSERT INTO evolution_reports (id, report_type, summary, details, trigger)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      uuidv4(),
      'maintenance',
      `Memory: ${lineCount} lines MEMORY.md, ${(Object.values(distribution) as number[]).reduce((a, b) => a + b, 0)} memories. Skills: ${skillResult.totalSkillsAdded} added to ${skillResult.agentsUpdated} agents.${staleCleaned > 0 ? ` Cleaned ${staleCleaned} stale tasks.` : ''}`,
      JSON.stringify({ lineCount, distribution, pruned, skillAcquisition: skillResult, staleCleaned }),
      'scheduled',
    ],
  );

  return { lineCount, distribution, pruned, skillAcquisition: skillResult, staleCleaned };
}

/**
 * Update the scheduled_tasks DB entry to track when a built-in schedule actually fires.
 * This keeps Mission Control's Schedules page in sync with reality.
 */
async function trackScheduleRun(scheduleName: string): Promise<void> {
  try {
    await query(
      `UPDATE scheduled_tasks SET last_run_at = NOW(), run_count = run_count + 1 WHERE name = $1`,
      [scheduleName],
    );
  } catch {
    // Non-critical — don't fail the job if tracking fails
  }
}

export function createEvolutionWorker(): Worker<EvolutionJobData> {
  const worker = new Worker<EvolutionJobData>(
    QUEUE_NAMES.EVOLUTION,
    async (job: Job<EvolutionJobData>) => {
      const { type, agentName, failureContext, trigger } = job.data;
      console.log(`[hermes:evolution] Processing: type=${type} trigger=${trigger}`);

      switch (type) {
        case 'scheduled-analysis': {
          const result = await runScheduledAnalysis();
          await trackScheduleRun('evolution-analysis');
          return result;
        }

        case 'refine-agent':
          if (!agentName) throw new Error('agentName required for refine-agent');
          return await refineAgent(agentName, failureContext);

        case 'memory-maintenance': {
          const result = await runMemoryMaintenance();
          await trackScheduleRun('memory-maintenance');
          return result;
        }

        case 'performance-report': {
          await trackScheduleRun('performance-report');
          const trends = await getAgentTrends();
          const totalTasks = await query(`SELECT COUNT(*) as cnt FROM task_logs WHERE created_at > NOW() - INTERVAL '24 hours'`);
          const report = {
            period: '24h',
            totalTasks: Number(totalTasks.rows[0]?.cnt || 0),
            agents: trends,
            generatedAt: new Date().toISOString(),
          };

          await query(
            `INSERT INTO evolution_reports (id, report_type, summary, details, trigger)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), 'performance', `Daily report: ${report.totalTasks} tasks across ${trends.length} agents`, JSON.stringify(report), 'scheduled'],
          );

          return report;
        }

        case 'agent-health-check': {
          await trackScheduleRun('agent-health-check');
          const config = getConfig();
          const agentFiles = fs.readdirSync(config.agentsDir).filter(f => f.endsWith('.md'));
          const health: Array<{ name: string; exists: boolean; sizeBytes: number }> = [];

          for (const file of agentFiles) {
            const filePath = path.join(config.agentsDir, file);
            const stat = fs.statSync(filePath);
            health.push({ name: file.replace('.md', ''), exists: true, sizeBytes: stat.size });
          }

          await query(
            `INSERT INTO evolution_reports (id, report_type, summary, details, trigger)
             VALUES ($1, $2, $3, $4, $5)`,
            [uuidv4(), 'health-check', `${agentFiles.length} agent files checked`, JSON.stringify({ agents: health }), 'scheduled'],
          );

          return { agentCount: agentFiles.length, agents: health };
        }

        default:
          throw new Error(`Unknown evolution type: ${type}`);
      }
    },
    {
      connection: getRedis(),
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.EVOLUTION],
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[hermes:evolution] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
