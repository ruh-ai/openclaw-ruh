/**
 * Paperclip + OpenSpace orchestration layer.
 *
 * Composes the Paperclip client (company/worker management) and
 * OpenSpace client (skill evolution) into the agent lifecycle.
 *
 * All functions are fire-and-forget safe: they log on failure, never throw,
 * and never block the primary agent creation or chat flows.
 */

import { v4 as uuidv4 } from 'uuid';
import * as paperclip from './paperclipClient';
import * as openspace from './openspaceClient';
import * as agentStore from './agentStore';
import type { AgentRecord, PaperclipWorkerRecord } from './agentStore';
import type { ExecutionSummary } from './chatPersistence';

// ---------------------------------------------------------------------------
// Company + Worker provisioning
// ---------------------------------------------------------------------------

/**
 * Provision a Paperclip company and workers for a Ruh.ai agent.
 *
 * Called fire-and-forget after agent creation or forge promotion.
 * If Paperclip is unavailable, logs a warning and returns silently.
 */
export async function provisionPaperclipCompany(agent: AgentRecord): Promise<void> {
  const available = await paperclip.isAvailable();
  if (!available) {
    console.info('[paperclip-orchestrator] Paperclip not available, skipping provisioning');
    return;
  }

  // Don't re-provision if already mapped
  if (agent.paperclip_company_id) {
    console.info(`[paperclip-orchestrator] Agent ${agent.id} already has Paperclip company ${agent.paperclip_company_id}`);
    return;
  }

  // 1. Create company
  const company = await paperclip.createCompany(
    agent.name,
    agent.description || undefined,
  );
  if (!company) {
    console.warn(`[paperclip-orchestrator] Failed to create Paperclip company for agent ${agent.id}`);
    return;
  }

  const workers: PaperclipWorkerRecord[] = [];

  // 2. Always create Coordinator worker
  const coordinator = await paperclip.createWorker(company.id, {
    name: 'Coordinator',
    role: 'ceo',
    capabilities: `Receives user requests for ${agent.name}, decomposes into tasks, delegates to specialized workers, merges results.`,
    adapterType: 'openclaw_gateway',
  });
  if (coordinator) {
    workers.push({
      worker_id: uuidv4(),
      paperclip_agent_id: coordinator.id,
      role: 'ceo',
      name: 'Coordinator',
      skill_cluster: [],
    });
  }

  // 3. Create workers from skill graph clusters
  const clusters = extractSkillClusters(agent.skill_graph);
  for (const cluster of clusters) {
    const worker = await paperclip.createWorker(company.id, {
      name: cluster.name,
      role: 'engineer',
      capabilities: `Handles: ${cluster.skills.join(', ')}`,
      adapterType: 'openclaw_gateway',
    });
    if (worker) {
      workers.push({
        worker_id: uuidv4(),
        paperclip_agent_id: worker.id,
        role: 'engineer',
        name: cluster.name,
        skill_cluster: cluster.skills,
      });
    }
  }

  // 4. Persist mapping
  await agentStore.updatePaperclipMapping(agent.id, company.id, workers);
  console.info(
    `[paperclip-orchestrator] Provisioned company ${company.id} with ${workers.length} workers for agent ${agent.id}`,
  );
}

// ---------------------------------------------------------------------------
// Post-chat cost logging
// ---------------------------------------------------------------------------

/**
 * Log cost metrics to Paperclip after a chat response completes.
 *
 * Called fire-and-forget from the chat persistence layer.
 * Never blocks the chat response.
 */
export async function logPostChatMetrics(
  agent: AgentRecord,
  tokenUsage: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  },
): Promise<void> {
  if (!agent.paperclip_company_id) return;

  const available = await paperclip.isAvailable();
  if (!available) return;

  // Find the first worker (Coordinator) to attribute costs to
  const coordinatorWorker = agent.paperclip_workers.find((w) => w.role === 'ceo');
  if (!coordinatorWorker) return;

  // Estimate cost (rough: $3/MTok input, $15/MTok output for Claude Sonnet)
  const inputTokens = tokenUsage.inputTokens ?? 0;
  const outputTokens = tokenUsage.outputTokens ?? 0;
  const estimatedCostCents = (inputTokens * 0.0003 + outputTokens * 0.0015) / 10;

  await paperclip.logCostEvent(agent.paperclip_company_id, {
    agentId: coordinatorWorker.paperclip_agent_id,
    model: tokenUsage.model ?? 'unknown',
    inputTokens,
    outputTokens,
    costCents: Math.round(estimatedCostCents * 10000) / 10000,
  });
}

// ---------------------------------------------------------------------------
// Background skill analysis
// ---------------------------------------------------------------------------

/**
 * Record execution and analyze for skill evolution.
 *
 * Called fire-and-forget after chat persistence completes.
 * Writes execution log to sandbox, detects repeatable tool patterns,
 * and proposes skill capture when patterns appear 3+ times.
 *
 * This is the core learning loop:
 *   Chat completes → execution recorded → patterns detected → skills proposed
 */
export async function recordAndAnalyze(
  agent: AgentRecord,
  sandboxId: string,
  execution: ExecutionSummary,
): Promise<void> {
  // Record execution and analyze for patterns (OpenSpace)
  const analysisResult = await openspace.recordAndAnalyzeExecution(sandboxId, execution);

  if (analysisResult && analysisResult.evolvedSkills.length > 0) {
    console.info(
      `[paperclip-orchestrator] Detected ${analysisResult.evolvedSkills.length} repeatable patterns for agent ${agent.id}:`,
      analysisResult.evolvedSkills.map((s) => s.name),
    );

    // TODO: Write proposed skills as SKILL.md files to the sandbox
    // TODO: Surface proposals in the builder UI via system events
    // TODO: Update agent.skills after user approval
  }

  // Log cost to Paperclip if configured
  if (agent.paperclip_company_id && execution.totalToolCalls > 0) {
    await logPostChatMetrics(agent, {
      // Token counts aren't available from the SSE stream — estimate from content length
      inputTokens: Math.round(execution.responseContent.length / 4),
      outputTokens: Math.round(execution.responseContent.length / 4),
    });
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Clean up Paperclip resources when an agent is deleted.
 *
 * Paperclip handles its own GC for companies, but we log the intent.
 */
export async function teardownPaperclipCompany(agentId: string): Promise<void> {
  const agent = await agentStore.getAgent(agentId);
  if (!agent?.paperclip_company_id) return;

  console.info(
    `[paperclip-orchestrator] Agent ${agentId} deleted, Paperclip company ${agent.paperclip_company_id} may need cleanup`,
  );
  // Paperclip company deletion is not automated — requires board-level access.
  // Log for now; add API call when Paperclip supports cascade delete.
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SkillCluster {
  name: string;
  skills: string[];
}

/**
 * Extract skill clusters from the agent's skill graph.
 *
 * Groups skills by category or creates one cluster per skill if no
 * categories are defined. Falls back to a single "General" worker
 * if the skill graph is empty or unparseable.
 */
function extractSkillClusters(skillGraph: unknown): SkillCluster[] {
  if (!skillGraph || !Array.isArray(skillGraph)) {
    return [{ name: 'General Worker', skills: [] }];
  }

  // Try to group skills by category or type
  const categoryMap = new Map<string, string[]>();

  for (const node of skillGraph) {
    if (!node || typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    const category = typeof record.category === 'string' ? record.category : 'general';

    if (!name) continue;

    const existing = categoryMap.get(category) ?? [];
    existing.push(name);
    categoryMap.set(category, existing);
  }

  if (categoryMap.size === 0) {
    return [{ name: 'General Worker', skills: [] }];
  }

  // If all skills are in one category, create a single worker
  if (categoryMap.size === 1) {
    const [category, skills] = [...categoryMap.entries()][0];
    return [{ name: formatWorkerName(category), skills }];
  }

  return [...categoryMap.entries()].map(([category, skills]) => ({
    name: formatWorkerName(category),
    skills,
  }));
}

function formatWorkerName(category: string): string {
  if (category === 'general') return 'General Worker';
  return category
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
