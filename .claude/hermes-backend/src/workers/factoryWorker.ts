import { Worker, type Job } from 'bullmq';
import { spawn } from 'bun';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../redis';
import { getConfig } from '../config';
import { getQueue, QUEUE_NAMES, WORKER_CONCURRENCY, type FactoryJobData, type IngestionJobData } from '../queues/definitions';
import { publish } from '../eventBus';
import { query } from '../db';

/**
 * List existing agent names and descriptions for the factory prompt.
 */
async function getExistingAgents(): Promise<Array<{ name: string; description: string }>> {
  const config = getConfig();
  const agents: Array<{ name: string; description: string }> = [];

  const files = fs.readdirSync(config.agentsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(config.agentsDir, file), 'utf-8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);
    agents.push({
      name: nameMatch?.[1]?.trim() || file.replace('.md', ''),
      description: descMatch?.[1]?.trim() || 'No description',
    });
  }

  return agents;
}

export function createFactoryWorker(): Worker<FactoryJobData> {
  const worker = new Worker<FactoryJobData>(
    QUEUE_NAMES.FACTORY,
    async (job: Job<FactoryJobData>) => {
      const { gapDescription, recentTasks, trigger } = job.data;
      console.log(`[hermes:factory] Creating new agent for gap: ${gapDescription.slice(0, 80)}...`);

      const config = getConfig();
      const existingAgents = await getExistingAgents();

      const creationPrompt = `You are the Hermes Agent Factory. Your job is to create a new specialist agent.

## Gap Identified
${gapDescription}

## Recent Tasks That Revealed This Gap
${recentTasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## Existing Agents (do not duplicate)
${existingAgents.map(a => `- **${a.name}**: ${a.description}`).join('\n')}

## Your Task
Create a new specialist agent that fills this gap. Output a complete agent .md file.

Requirements:
1. Follow this exact frontmatter format:
\`\`\`
---
name: <short-name>
description: <one-line — what and when to use>
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---
\`\`\`

2. Include sections: Stack, Key Patterns, Key Files, Before Working, Testing
3. Be specific to the openclaw-ruh-enterprise project
4. Keep scope tight — specialist, not generalist
5. Do NOT give it the Agent tool (workers don't delegate)

Output ONLY the complete .md file content, nothing else. Start with the frontmatter.`;

      const hermesPath = path.join(config.agentsDir, 'hermes.md');
      const proc = spawn({
        cmd: [config.claudeCliPath, '--agent', hermesPath, '--print', '--dangerously-skip-permissions'],
        stdin: new Blob([creationPrompt]),
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: config.projectRoot,
      });

      const exitCode = await proc.exited;
      const output = await new Response(proc.stdout).text();

      if (exitCode !== 0 || !output.trim()) {
        console.error('[hermes:factory] Agent creation subprocess failed');
        throw new Error('Agent creation subprocess failed');
      }

      // Extract agent name from frontmatter
      const nameMatch = output.match(/^name:\s*(.+)$/m);
      const agentName = nameMatch?.[1]?.trim();

      if (!agentName) {
        throw new Error('Could not extract agent name from generated output');
      }

      // Write the agent file
      const agentPath = path.join(config.agentsDir, `${agentName}.md`);
      if (fs.existsSync(agentPath)) {
        console.warn(`[hermes:factory] Agent ${agentName} already exists — skipping`);
        return { created: false, reason: 'Agent already exists', agentName };
      }

      fs.writeFileSync(agentPath, output.trim());

      // Register in PostgreSQL
      await query(
        `INSERT INTO agents (id, name, description, model, file_path, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (name) DO NOTHING`,
        [
          uuidv4(),
          agentName,
          `Auto-created specialist for: ${gapDescription.slice(0, 100)}`,
          'sonnet',
          agentPath,
        ],
      );

      // Log refinement
      await query(
        `INSERT INTO refinements (id, agent_name, change_description, reason)
         VALUES ($1, $2, $3, $4)`,
        [
          uuidv4(),
          agentName,
          `Created new agent via Agent Factory`,
          gapDescription.slice(0, 300),
        ],
      );

      // Store evolution report
      await query(
        `INSERT INTO evolution_reports (id, report_type, summary, details, actions_taken, trigger)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          'creation',
          `Created new agent: ${agentName}`,
          JSON.stringify({ agentName, gapDescription, recentTasks }),
          JSON.stringify([{ type: 'agent-created', agent: agentName, description: 'New specialist created and registered' }]),
          trigger,
        ],
      );

      // Schedule a test task for the new agent
      await getQueue(QUEUE_NAMES.INGESTION).add('ingest', {
        description: `[factory-test] Validate new agent "${agentName}": run a simple task from its domain to verify it works`,
        source: 'self',
        agentName,
        priority: 3,
      } satisfies IngestionJobData);

      publish({ type: 'refinement', action: 'created', data: { agentName, type: 'factory-creation' } });

      console.log(`[hermes:factory] Created agent: ${agentName} at ${agentPath}`);
      return { created: true, agentName, agentPath };
    },
    {
      connection: getRedis(),
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.FACTORY],
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[hermes:factory] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
