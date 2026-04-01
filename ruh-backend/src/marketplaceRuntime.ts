import type * as agentStore from './agentStore';

export interface RuntimeSkillSnapshot {
  skillId: string;
  name: string;
  description: string;
  skillMd: string;
}

export interface RuntimeCronSnapshot {
  name: string;
  schedule: string;
  message: string;
}

export interface AgentRuntimeSnapshot {
  schemaVersion: 1;
  systemName: string;
  avatar: string;
  description: string;
  triggerLabel: string;
  soulContent: string;
  skills: RuntimeSkillSnapshot[];
  cronJobs: RuntimeCronSnapshot[];
  runtimeInputs: agentStore.AgentRuntimeInputRecord[];
  toolConnections: agentStore.AgentToolConnectionRecord[];
  triggers: agentStore.AgentTriggerRecord[];
  channels: agentStore.AgentChannelRecord[];
  agentRules: string[];
  workflow: unknown | null;
}

interface SkillGraphNodeLike {
  skill_id?: unknown;
  name?: unknown;
  description?: unknown;
  skill_md?: unknown;
}

function sanitizeConfigSummaryItem(item: string): string | null {
  const trimmed = item.trim();
  if (!trimmed) {
    return null;
  }

  if (/(secret|token|password|api[_ -]?key|client[_ -]?secret|refresh[_ -]?token)/i.test(trimmed)) {
    return null;
  }

  if (/(callback|redirect)[ _-]?url/i.test(trimmed) || /https?:\/\//i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function describeToolStatus(status: agentStore.AgentToolConnectionRecord['status']): string {
  switch (status) {
    case 'configured':
      return 'configured';
    case 'missing_secret':
      return 'selected but missing credentials';
    case 'unsupported':
      return 'manual plan only; not runtime-ready';
    case 'available':
    default:
      return 'available but not configured';
  }
}

function describeTrigger(trigger: agentStore.AgentTriggerRecord): string {
  const supportText =
    trigger.status === 'supported'
      ? 'supported'
      : 'manual plan only; not runtime-ready';

  if (trigger.kind === 'schedule' && trigger.schedule) {
    return `${supportText}; schedule ${trigger.schedule}`;
  }

  return supportText;
}

function buildConfigContextLines(agent: agentStore.AgentRecord): string[] {
  const toolLines = agent.tool_connections.map((tool) => {
    const safeSummary = tool.configSummary
      .map(sanitizeConfigSummaryItem)
      .filter((item): item is string => Boolean(item))
      .slice(0, 2);
    const detailSuffix = safeSummary.length > 0 ? ` (${safeSummary.join('; ')})` : '';
    return `- Tool ${tool.name}: ${describeToolStatus(tool.status)}${detailSuffix}`;
  });

  const triggerLines = agent.triggers.map((trigger) => {
    const title = trigger.title || trigger.id;
    return `- Trigger ${title}: ${describeTrigger(trigger)}`;
  });

  const runtimeInputLines = agent.runtime_inputs.map((input) => {
    const status = input.value.trim().length > 0 ? 'provided' : 'missing';
    return `- Runtime input ${input.label || input.key}: ${status}`;
  });

  if (
    toolLines.length === 0
    && triggerLines.length === 0
    && runtimeInputLines.length === 0
  ) {
    return [];
  }

  return [
    '## Configured Tools And Triggers',
    ...toolLines,
    ...runtimeInputLines,
    ...triggerLines,
    '',
  ];
}

function buildFallbackSkillContent(skill: {
  skillId: string;
  name: string;
  description: string;
}): string {
  return [
    '---',
    `name: ${skill.skillId}`,
    'version: 1.0.0',
    `description: "${skill.description || skill.name}"`,
    'user-invocable: false',
    '---',
    '',
    `# ${skill.name}`,
    '',
    skill.description || 'Auto-generated skill.',
    '',
    '# TODO: Implement this skill',
  ].join('\n');
}

function readSkillGraphNodes(agent: agentStore.AgentRecord): SkillGraphNodeLike[] {
  if (!Array.isArray(agent.skill_graph)) {
    return [];
  }
  return agent.skill_graph.filter(
    (item): item is SkillGraphNodeLike =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}

export function buildSoulContentFromAgent(agent: agentStore.AgentRecord): string {
  const skillGraphNodes = readSkillGraphNodes(agent);
  const skillList = skillGraphNodes.length > 0
    ? skillGraphNodes.map((node) => ({
        name: typeof node.name === 'string' ? node.name : String(node.skill_id ?? ''),
        description: typeof node.description === 'string' ? node.description : '',
      }))
    : agent.skills.map((skill) => ({ name: skill, description: '' }));

  const lines = [
    `# You are ${agent.name}`,
    '',
    `You are an AI agent named **${agent.name}**. ${agent.description || ''}`,
    '',
    '## Your Mission',
    `You were built to ${agent.description || `run the following skills: ${agent.skills.join(', ')}`}.`,
    'When someone messages you, use your skills to complete the task and respond clearly with what you did.',
    '',
    '## Your Skills',
    ...skillList.map((node) =>
      node.description ? `- **${node.name}**: ${node.description}` : `- **${node.name}**`,
    ),
    '',
    ...(agent.agent_rules.length > 0
      ? ['## Rules', ...agent.agent_rules.map((rule) => `- ${rule}`), '']
      : []),
    ...buildConfigContextLines(agent),
    '## Workspace Rules',
    '- When a conversation session path is provided, ALWAYS work exclusively within that directory.',
    '- Before creating or writing any files, `cd` to the session directory first.',
    '- Never create output files in the workspace root — always use the session-scoped path.',
    '- If you need shared resources from the workspace root, read them but write outputs to the session directory.',
    '',
    '## Behavior',
    '- Be concise and action-oriented. Execute tasks, do not just describe them.',
    `- Your trigger: ${agent.trigger_label || 'manual'}`,
  ];

  return lines.join('\n');
}

export function buildCronJobsFromAgent(
  agent: agentStore.AgentRecord,
): RuntimeCronSnapshot[] {
  const configuredSchedule = agent.triggers.find(
    (trigger) =>
      trigger.kind === 'schedule'
      && trigger.status === 'supported'
      && typeof trigger.schedule === 'string'
      && trigger.schedule.trim().length > 0,
  );
  if (configuredSchedule?.schedule) {
    return [
      {
        name: `${agent.name}-schedule`,
        schedule: configuredSchedule.schedule,
        message: `Run ${agent.name} scheduled task`,
      },
    ];
  }

  const scheduleRule = agent.agent_rules.find(
    (rule) =>
      rule.toLowerCase().includes('cron:')
      || rule.toLowerCase().includes('schedule:'),
  );
  const cronMatch = scheduleRule?.match(/\d{1,2}\s+\d{1,2}\s+[\d*]+\s+[\d*]+\s+[\d*]+/);
  if (!cronMatch) {
    return [];
  }

  return [
    {
      name: `${agent.name}-schedule`,
      schedule: cronMatch[0],
      message: `Run ${agent.name} scheduled task`,
    },
  ];
}

export function buildRuntimeSkillsFromAgent(
  agent: agentStore.AgentRecord,
): RuntimeSkillSnapshot[] {
  const nodes = readSkillGraphNodes(agent);
  if (nodes.length > 0) {
    return nodes
      .map((node) => {
        const skillId = typeof node.skill_id === 'string'
          ? node.skill_id
          : typeof node.name === 'string'
          ? node.name.toLowerCase().replace(/\s+/g, '-')
          : '';
        const name = typeof node.name === 'string' ? node.name : skillId;
        const description = typeof node.description === 'string' ? node.description : '';
        if (!skillId || !name) {
          return null;
        }
        return {
          skillId,
          name,
          description,
          skillMd: typeof node.skill_md === 'string' && node.skill_md.trim().length > 0
            ? node.skill_md
            : buildFallbackSkillContent({ skillId, name, description }),
        };
      })
      .filter((item): item is RuntimeSkillSnapshot => Boolean(item));
  }

  return agent.skills.map((name) => {
    const skillId = name.toLowerCase().replace(/\s+/g, '-');
    return {
      skillId,
      name,
      description: '',
      skillMd: buildFallbackSkillContent({ skillId, name, description: '' }),
    };
  });
}

export function buildPublishedRuntimeSnapshot(
  agent: agentStore.AgentRecord,
): AgentRuntimeSnapshot {
  return {
    schemaVersion: 1,
    systemName: agent.name,
    avatar: agent.avatar,
    description: agent.description,
    triggerLabel: agent.trigger_label,
    soulContent: buildSoulContentFromAgent(agent),
    skills: buildRuntimeSkillsFromAgent(agent),
    cronJobs: buildCronJobsFromAgent(agent),
    runtimeInputs: agent.runtime_inputs,
    toolConnections: agent.tool_connections.map((tool) => ({
      ...tool,
      status: tool.status === 'unsupported' ? 'unsupported' : 'available',
      configSummary: [],
    })),
    triggers: agent.triggers,
    channels: agent.channels,
    agentRules: agent.agent_rules,
    workflow: agent.workflow,
  };
}

export function buildInstalledAgentSeed(
  snapshot: AgentRuntimeSnapshot,
  options: {
    userId: string;
    orgId: string;
    fallbackName: string;
    fallbackDescription: string;
  },
): Parameters<typeof import('./agentStore').saveAgent>[0] {
  return {
    name: snapshot.systemName || options.fallbackName,
    avatar: snapshot.avatar,
    description: snapshot.description || options.fallbackDescription,
    skills: snapshot.skills.map((skill) => skill.name),
    triggerLabel: snapshot.triggerLabel || 'Installed from marketplace',
    status: 'active',
    skillGraph: snapshot.skills.map((skill) => ({
      skill_id: skill.skillId,
      name: skill.name,
      description: skill.description,
      skill_md: skill.skillMd,
    })),
    workflow: snapshot.workflow,
    agentRules: snapshot.agentRules,
    runtimeInputs: snapshot.runtimeInputs,
    toolConnections: snapshot.toolConnections,
    triggers: snapshot.triggers,
    channels: snapshot.channels,
    createdBy: options.userId,
    orgId: options.orgId,
  };
}

export function buildConfigurePayloadFromAgent(agent: agentStore.AgentRecord) {
  const snapshot = buildPublishedRuntimeSnapshot(agent);
  return {
    system_name: snapshot.systemName,
    soul_content: snapshot.soulContent,
    skills: snapshot.skills.map((skill) => ({
      skill_id: skill.skillId,
      name: skill.name,
      description: skill.description,
      skill_md: skill.skillMd,
    })),
    cron_jobs: snapshot.cronJobs,
    runtime_inputs: snapshot.runtimeInputs,
    agent_id: agent.id,
  };
}
