/**
 * Linear bidirectional sync — updates issue status and posts comments
 * when Hermes completes work on a Linear-originated goal.
 */

const LINEAR_API = 'https://api.linear.app/graphql';

function getLinearApiKey(): string | null {
  return process.env.LINEAR_API_KEY?.trim() || null;
}

async function linearGraphQL(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  const apiKey = getLinearApiKey();
  if (!apiKey) return null;

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    console.error(`[hermes:linear-sync] GraphQL error: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json() as any;
  if (json.errors?.length) {
    console.error(`[hermes:linear-sync] GraphQL errors:`, json.errors);
  }
  return json.data;
}

/**
 * Resolve a human identifier like RUH2-1 to a Linear issue UUID
 */
export async function resolveLinearIssueId(identifier: string): Promise<{ id: string; teamId: string } | null> {
  const parts = identifier.split('-');
  const num = parseInt(parts.pop() || '0');
  const teamKey = parts.join('-');

  const data = await linearGraphQL(`
    query($filter: IssueFilter) {
      issues(filter: $filter, first: 1) {
        nodes { id team { id } }
      }
    }
  `, {
    filter: { number: { eq: num }, team: { key: { eq: teamKey } } }
  });

  const issue = data?.issues?.nodes?.[0];
  return issue ? { id: issue.id, teamId: issue.team.id } : null;
}

/**
 * Get workflow states for a team
 */
async function getTeamStates(teamId: string): Promise<Map<string, string>> {
  const data = await linearGraphQL(`
    query($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name type } }
      }
    }
  `, { teamId });

  const map = new Map<string, string>();
  for (const state of data?.team?.states?.nodes ?? []) {
    map.set(state.type, state.id);
    map.set(state.name.toLowerCase(), state.id);
  }
  return map;
}

/**
 * Update a Linear issue status
 */
export async function updateLinearIssueStatus(
  issueId: string,
  teamId: string,
  targetType: 'started' | 'completed' | 'cancelled',
): Promise<boolean> {
  const states = await getTeamStates(teamId);
  const stateId = states.get(targetType);
  if (!stateId) {
    console.error(`[hermes:linear-sync] No state of type ${targetType} found for team ${teamId}`);
    return false;
  }

  const result = await linearGraphQL(`
    mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
    }
  `, { id: issueId, stateId });

  return result?.issueUpdate?.success ?? false;
}

/**
 * Post a comment on a Linear issue
 */
export async function postLinearComment(issueId: string, body: string): Promise<boolean> {
  const result = await linearGraphQL(`
    mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
  `, { issueId, body });

  return result?.commentCreate?.success ?? false;
}

/**
 * Full sync: resolve identifier, update status, post comment
 */
export async function syncGoalResultToLinear(opts: {
  linearIdentifier: string;
  linearIssueId?: string;
  success: boolean;
  goalTitle: string;
  tasksSummary: string;
  durationMs?: number;
}): Promise<void> {
  if (!getLinearApiKey()) {
    console.log('[hermes:linear-sync] No LINEAR_API_KEY — skipping sync');
    return;
  }

  try {
    let issueId = opts.linearIssueId;
    let teamId: string | undefined;

    if (!issueId && opts.linearIdentifier) {
      const resolved = await resolveLinearIssueId(opts.linearIdentifier);
      if (!resolved) {
        console.error(`[hermes:linear-sync] Could not resolve ${opts.linearIdentifier}`);
        return;
      }
      issueId = resolved.id;
      teamId = resolved.teamId;
    }

    if (!issueId) return;

    if (!teamId) {
      const data = await linearGraphQL('query($id: String!) { issue(id: $id) { team { id } } }', { id: issueId });
      teamId = data?.issue?.team?.id;
    }
    if (!teamId) return;

    // Update status
    const targetState = opts.success ? 'completed' : 'cancelled';
    const statusOk = await updateLinearIssueStatus(issueId, teamId, opts.success ? 'completed' : 'cancelled');
    console.log(`[hermes:linear-sync] ${opts.linearIdentifier} status -> ${targetState}: ${statusOk}`);

    // Post comment
    const duration = opts.durationMs ? `${Math.round(opts.durationMs / 1000)}s` : 'unknown';
    const emoji = opts.success ? '✅' : '❌';
    const body = [
      `## ${emoji} ${opts.success ? 'Completed' : 'Failed'} by Hermes`,
      '',
      `**Goal:** ${opts.goalTitle}`,
      `**Duration:** ${duration}`,
      '',
      '### Summary',
      opts.tasksSummary,
      '',
      '---',
      '*Automated by Hermes Agent Orchestrator*',
    ].join('\n');

    await postLinearComment(issueId, body);
    console.log(`[hermes:linear-sync] Posted comment on ${opts.linearIdentifier}`);
  } catch (err) {
    console.error('[hermes:linear-sync] Sync failed:', err);
  }
}
