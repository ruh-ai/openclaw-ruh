import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, type AnalystJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import { spawnClaudeAgent } from './subprocess';
import * as goalStore from '../stores/goalStore';
import { query } from '../db';

interface ProposedGoal {
  title: string;
  description: string;
  priority: string;
  acceptanceCriteria: string[];
}

interface StrategistOutput {
  assessment: string;
  proposedGoals: ProposedGoal[];
  completedGoalFollowups?: Array<{
    completedGoalTitle: string;
    followupTitle: string;
    followupDescription: string;
  }>;
  agentHealthNotes?: string[];
}

/**
 * Build context for the strategist — active goals, completed goals, agent state.
 */
async function buildStrategistContext(): Promise<string> {
  const activeGoals = await goalStore.listGoals({ status: 'active', limit: 20 });
  const completedGoals = await goalStore.listGoals({ status: 'completed', limit: 10 });

  const agents = await query('SELECT name, tasks_total, tasks_passed, tasks_failed, version, circuit_state FROM agents ORDER BY name');

  const recentReports = await query(
    `SELECT report_type, summary FROM evolution_reports ORDER BY created_at DESC LIMIT 5`
  );

  const parts: string[] = [];

  parts.push('## Active Goals (do not duplicate these)');
  if (activeGoals.items.length === 0) {
    parts.push('No active goals — the system needs new direction.');
  } else {
    for (const g of activeGoals.items) {
      parts.push(`- [${g.priority}] ${g.title} (${g.progressPct}% done)`);
    }
  }

  parts.push('\n## Completed Goals (suggest follow-ups if appropriate)');
  if (completedGoals.items.length === 0) {
    parts.push('No completed goals yet.');
  } else {
    for (const g of completedGoals.items) {
      parts.push(`- ${g.title}`);
    }
  }

  parts.push('\n## Agent Performance');
  for (const a of agents.rows) {
    const total = Number(a.tasks_total);
    const pass = Number(a.tasks_passed);
    const fail = Number(a.tasks_failed);
    const rate = total > 0 ? Math.round((pass / total) * 100) : 0;
    parts.push(`- ${a.name} v${a.version}: ${total} tasks, ${rate}% pass, circuit=${a.circuit_state}`);
  }

  parts.push('\n## Recent Evolution Reports');
  for (const r of recentReports.rows) {
    parts.push(`- [${r.report_type}] ${r.summary}`);
  }

  return parts.join('\n');
}

/**
 * Run the strategist — spawns the strategist agent, parses output, creates goals.
 */
export async function runStrategist(): Promise<{
  goalsCreated: number;
  assessment: string;
  followups: number;
}> {
  const config = getConfig();
  const agentPath = path.join(config.agentsDir, 'strategist.md');

  // Build context
  const context = await buildStrategistContext();

  const prompt = `You are running your periodic system assessment. Review the project and propose new goals.

${context}

Now read the codebase (docs/project-focus.md, TODOS.md, docs/knowledge-base/000-INDEX.md) and propose up to 3 new goals. Check the active goals list carefully — do NOT duplicate anything already active.

Output ONLY valid JSON matching your output format specification.`;

  console.log('[hermes:strategist] Running system assessment...');

  const result = await spawnClaudeAgent({
    jobId: `strategist-${uuidv4().slice(0, 8)}`,
    agentPath,
    prompt,
    timeout: config.executionTimeout,
    dangerouslySkipPermissions: true,
  });

  if (!result.success) {
    console.error(`[hermes:strategist] Agent failed: ${result.stderr?.slice(0, 200)}`);
    throw new Error(`Strategist agent failed: ${result.stderr?.slice(0, 200)}`);
  }

  // Parse output
  let parsed: StrategistOutput;
  try {
    const stdout = result.stdout;
    const jsonMatch = stdout.match(/\{[\s\S]*"proposedGoals"[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      const wrapper = JSON.parse(stdout);
      const resultText = wrapper.result || wrapper.content || stdout;
      const innerMatch = resultText.match(/\{[\s\S]*"proposedGoals"[\s\S]*\}/);
      parsed = innerMatch ? JSON.parse(innerMatch[0]) : { assessment: 'Could not parse', proposedGoals: [] };
    }
  } catch {
    console.warn('[hermes:strategist] Could not parse output');
    parsed = { assessment: 'Output parsing failed', proposedGoals: [] };
  }

  // Create proposed goals
  let goalsCreated = 0;
  for (const proposed of parsed.proposedGoals) {
    if (!proposed.title || !proposed.description) continue;

    // Check for duplicate (title similarity)
    const existing = await goalStore.listGoals({ status: 'active', limit: 50 });
    const isDuplicate = existing.items.some(g =>
      g.title.toLowerCase().includes(proposed.title.toLowerCase().slice(0, 30)) ||
      proposed.title.toLowerCase().includes(g.title.toLowerCase().slice(0, 30))
    );

    if (isDuplicate) {
      console.log(`[hermes:strategist] Skipped duplicate goal: ${proposed.title}`);
      continue;
    }

    const goal = await goalStore.createGoal({
      title: proposed.title,
      description: proposed.description,
      priority: proposed.priority || 'normal',
      acceptanceCriteria: proposed.acceptanceCriteria || [],
    });

    // Immediately trigger analyst for the new goal
    await getQueue(QUEUE_NAMES.ANALYST).add('analyze', {
      goalId: goal.id,
      goalTitle: goal.title,
      goalDescription: goal.description,
      acceptanceCriteria: goal.acceptanceCriteria,
      trigger: 'scheduled',
    } satisfies AnalystJobData, { priority: 5 });

    goalsCreated++;
    console.log(`[hermes:strategist] Created goal: ${goal.title} (${goal.priority})`);
  }

  // Create follow-up goals for completed work
  let followups = 0;
  if (parsed.completedGoalFollowups) {
    for (const fu of parsed.completedGoalFollowups) {
      if (!fu.followupTitle) continue;

      const goal = await goalStore.createGoal({
        title: fu.followupTitle,
        description: fu.followupDescription || `Follow-up to: ${fu.completedGoalTitle}`,
        priority: 'normal',
        acceptanceCriteria: [],
      });

      await getQueue(QUEUE_NAMES.ANALYST).add('analyze', {
        goalId: goal.id,
        goalTitle: goal.title,
        goalDescription: goal.description,
        acceptanceCriteria: goal.acceptanceCriteria,
        trigger: 'scheduled',
      } satisfies AnalystJobData, { priority: 7 });

      followups++;
    }
  }

  // Log evolution report
  await query(
    `INSERT INTO evolution_reports (id, report_type, summary, details, actions_taken, trigger)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      uuidv4(),
      'strategy',
      `Strategist: ${parsed.assessment?.slice(0, 150)}. Created ${goalsCreated} goals, ${followups} follow-ups.`,
      JSON.stringify(parsed),
      JSON.stringify({ goalsCreated, followups, healthNotes: parsed.agentHealthNotes }),
      'scheduled',
    ],
  );

  // Store assessment in memory
  await query(
    `INSERT INTO memories (id, text, type, agent, tags)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv4(), `Strategist assessment: ${parsed.assessment}`, 'decision', 'strategist', 'strategy,assessment,goals'],
  );

  publish({ type: 'memory', action: 'created', data: { type: 'strategy-assessment', goalsCreated, followups } });

  console.log(`[hermes:strategist] Assessment complete: ${goalsCreated} goals, ${followups} follow-ups`);
  return { goalsCreated, assessment: parsed.assessment || '', followups };
}
