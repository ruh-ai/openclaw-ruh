/**
 * Agent URI helpers.
 *
 * Format: `openclaw://<pipeline-id>/agents/<specialist>@<semver>`
 *
 * Stable identity across runs: the same `(pipeline, specialist, version)`
 * tuple produces an identical URI. Sub-agents carry their URI on every
 * memory write, decision-log entry, and result so an auditor can
 * reconstruct "which version of which specialist did this?" from the
 * decision log alone.
 */

const KEBAB = "[a-z][a-z0-9-]*";
const SEMVER = "[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-z0-9.]+)?";
const URI_PATTERN = new RegExp(
  `^openclaw://(${KEBAB})/agents/(${KEBAB})@(${SEMVER})$`,
);

const KEBAB_RE = new RegExp(`^${KEBAB}$`);
const SEMVER_RE = new RegExp(`^${SEMVER}$`);

export interface AgentUriParts {
  readonly pipelineId: string;
  readonly specialist: string;
  readonly version: string;
}

export class AgentUriError extends Error {
  constructor(
    public readonly input: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentUriError";
  }
}

/**
 * Construct an agent URI from its parts. Inputs are validated; throws
 * `AgentUriError` if any component fails its pattern.
 */
export function buildAgentUri(parts: AgentUriParts): string {
  if (!KEBAB_RE.test(parts.pipelineId)) {
    throw new AgentUriError(
      parts.pipelineId,
      `pipelineId "${parts.pipelineId}" must be kebab-case`,
    );
  }
  if (!KEBAB_RE.test(parts.specialist)) {
    throw new AgentUriError(
      parts.specialist,
      `specialist "${parts.specialist}" must be kebab-case`,
    );
  }
  if (!SEMVER_RE.test(parts.version)) {
    throw new AgentUriError(
      parts.version,
      `version "${parts.version}" must be semver (M.m.p[-prerelease])`,
    );
  }
  return `openclaw://${parts.pipelineId}/agents/${parts.specialist}@${parts.version}`;
}

/**
 * Parse an agent URI. Returns parts on success; throws `AgentUriError`
 * if the input doesn't match the canonical shape.
 */
export function parseAgentUri(uri: string): AgentUriParts {
  const m = URI_PATTERN.exec(uri);
  if (!m || !m[1] || !m[2] || !m[3]) {
    throw new AgentUriError(
      uri,
      `not a valid agent URI: "${uri}" — expected openclaw://<pipeline>/agents/<specialist>@<semver>`,
    );
  }
  return { pipelineId: m[1], specialist: m[2], version: m[3] };
}

/** True iff `uri` parses successfully. */
export function isAgentUri(uri: string): boolean {
  return URI_PATTERN.test(uri);
}
