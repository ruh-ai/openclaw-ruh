import { Worker, type Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type AnalystJobData, type IngestionJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import { spawnAgentProcess } from './subprocess';
import { analyst as log } from '../logger';
import * as taskStore from '../stores/taskStore';
import * as goalStore from '../stores/goalStore';
import * as boardTaskStore from '../stores/boardTaskStore';
import * as scoreStore from '../stores/scoreStore';
import * as agentStore from '../stores/agentStore';
import { query } from '../db';

/**
 * Assemble the analyst prompt with goal context and existing tasks.
 */
async function assembleAnalystPrompt(data: AnalystJobData): Promise<string> {
  const existingTasks = await boardTaskStore.listBoardTasks({ goalId: data.goalId, limit: 50 });

  const tasksSummary = existingTasks.items.length > 0
    ? existingTasks.items.map(t => `- [${t.status}] ${t.title}: ${t.description || t.title} (planned agent: ${t.plannedAgent || 'unassigned'}, last execution: ${t.lastExecutionAgent || 'none'})`).join('\n')
    : 'No tasks exist for this goal yet.';

  return `You are analyzing a goal and decomposing it into actionable tasks.

## Goal
**Title:** ${data.goalTitle}
**ID:** ${data.goalId}
**Description:** ${data.goalDescription}

## Acceptance Criteria
${data.acceptanceCriteria.length > 0
    ? data.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : 'No specific acceptance criteria defined.'}

## Existing Tasks for This Goal (${existingTasks.total} total)
${tasksSummary}

## Your Task
1. Read the codebase to understand the current state relevant to this goal
2. Compare acceptance criteria against existing tasks
3. Identify gaps — what criteria have no task or only incomplete/failed tasks?
4. For each gap, create a specific, actionable task assigned to the right agent
5. Output ONLY valid JSON in this format:

{
  "goalId": "${data.goalId}",
  "analysis": "Brief summary",
  "tasks": [
    { "description": "specific task", "agentName": "backend|frontend|test|...", "priority": 5 }
  ]
}

If all acceptance criteria are covered by existing tasks, output:
{ "goalId": "${data.goalId}", "analysis": "All criteria covered", "tasks": [] }`;
}

function numericPriorityToBoardPriority(priority: number): string {
  if (priority <= 1) return 'critical';
  if (priority <= 3) return 'high';
  if (priority <= 7) return 'normal';
  return 'low';
}

function toBoardTitle(description: string): string {
  const trimmed = description.trim();
  const sentence = trimmed.split(/[\n.!?]/)[0]?.trim() || trimmed;
  return sentence.slice(0, 120);
}

export function createAnalystWorker(): Worker<AnalystJobData> {
  const config = getConfig();

  const worker = new Worker<AnalystJobData>(
    QUEUE_NAMES.ANALYST,
    async (job: Job<AnalystJobData>) => {
      const { goalId, goalTitle, trigger } = job.data;
      log.info({ goalTitle, goalId }, 'Analyzing goal');

      // Assemble the prompt
      const prompt = await assembleAnalystPrompt(job.data);

      // Spawn the analyst agent
      const agentPath = path.join(config.agentsDir, 'analyst.md');
      const result = await spawnAgentProcess({
        jobId: job.id ?? uuidv4(),
        agentPath,
        prompt,
        timeout: config.executionTimeout,
        dangerouslySkipPermissions: true,
      });

      if (!result.success) {
        log.error({ goalId, stderr: result.stderr?.slice(0, 200) }, 'Agent failed for goal');
        throw new Error(`Analyst agent failed: ${result.stderr?.slice(0, 200)}`);
      }

      // Parse structured output
      let parsed: { goalId: string; analysis: string; tasks: Array<{ description: string; agentName: string; priority: number }> };
      try {
        // Try to extract JSON from the output (may be wrapped in Claude's response format)
        const stdout = result.stdout;
        const jsonMatch = stdout.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          // Try parsing the full output as JSON (--output-format json wraps it)
          const wrapper = JSON.parse(stdout);
          const resultText = wrapper.result || wrapper.content || stdout;
          const innerMatch = resultText.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
          parsed = innerMatch ? JSON.parse(innerMatch[0]) : { goalId, analysis: 'Could not parse output', tasks: [] };
        }
      } catch {
        log.warn({ goalId }, 'Could not parse analyst output');
        parsed = { goalId, analysis: 'Output parsing failed', tasks: [] };
      }

      // Create goal-linked board tasks first, then submit only newly created work.
      let tasksCreated = 0;
      for (const task of parsed.tasks) {
        const boardTaskResult = await boardTaskStore.createBoardTask({
          goalId,
          title: toBoardTitle(task.description),
          description: task.description,
          priority: numericPriorityToBoardPriority(task.priority ?? 5),
          plannedAgent: task.agentName || null,
          source: 'analyst',
        });

        if (!boardTaskResult.created) {
          continue;
        }

        await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
          description: task.description,
          source: 'analyst',
          agentName: task.agentName || 'auto',
          priority: task.priority ?? 5,
          goalId,
          metadata: { boardTaskId: boardTaskResult.task.id },
        } satisfies IngestionJobData, { priority: task.priority ?? 5 });
        tasksCreated++;
      }

      // Update goal progress
      await goalStore.getGoalProgress(goalId);

      // Score the analyst agent
      const taskLog = await taskStore.createTask({
        description: `Analyst decomposition for goal: ${goalTitle}`,
        delegatedTo: 'analyst',
        priority: 'normal',
        goalId,
      });
      await taskStore.updateTask(taskLog.id, {
        status: 'completed',
        resultSummary: `Created ${tasksCreated} tasks. ${parsed.analysis}`,
      });
      await scoreStore.createScore({
        agentName: 'analyst',
        taskId: taskLog.id,
        passed: true,
        score: tasksCreated > 0 ? 8 : 5,
        notes: `Decomposed goal into ${tasksCreated} tasks`,
      });
      await agentStore.incrementAgentScore('analyst', true);

      // Log to memories
      await query(
        `INSERT INTO memories (id, text, type, agent, tags, task_context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          `Analyst decomposed goal "${goalTitle}": ${parsed.analysis}. Created ${tasksCreated} tasks.`,
          'pattern',
          'analyst',
          `analyst,goal,decomposition`,
          goalId,
        ],
      );

      publish({ type: 'task', action: 'created', data: { type: 'analyst-decomposition', goalId, tasksCreated } });

      log.info({ goalTitle, analysis: parsed.analysis, tasksCreated }, 'Goal analysis complete');
      return { goalId, analysis: parsed.analysis, tasksCreated };
    },
    {
      connection: getRedis(),
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.ANALYST],
    },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'Job failed');
  });

  return worker;
}
