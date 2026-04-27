/**
 * Redaction utility — applied at write time per spec 005.
 *
 * "The runtime applies redaction rules at write time, not at read time. The
 *  unredacted version is never stored. Pipelines do not have a 'show me the
 *  unredacted version' mode — if a redaction rule is wrong, fix the rule and
 *  the corrected version applies to future writes."
 *
 * Redaction is one-way. We replace sensitive substrings BEFORE the decision
 * lands in the store; the store never sees the original.
 */

// ─── Default redaction rules ──────────────────────────────────────────

interface RedactionRule {
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly description: string;
}

/**
 * Canonical rule set. Pipelines may extend additively via DecisionLog
 * configuration; rules cannot be removed (only added).
 *
 * Patterns are checked in declaration order — first match in any segment
 * is replaced. Each pattern is a global regex (g flag) so all occurrences
 * within a string are replaced.
 */
export const DEFAULT_REDACTION_RULES: ReadonlyArray<RedactionRule> = [
  // API keys / tokens — common formats
  {
    pattern: /sk_(live|test)_[a-zA-Z0-9_-]{8,}/g,
    replacement: "<REDACTED:credential>",
    description: "Stripe-style API key",
  },
  {
    pattern: /sk-[a-zA-Z0-9_-]{16,}/g,
    replacement: "<REDACTED:credential>",
    description: "OpenAI / Anthropic-style API key",
  },
  {
    pattern: /Bearer [A-Za-z0-9._-]{16,}/g,
    replacement: "Bearer <REDACTED:credential>",
    description: "Bearer token",
  },
  {
    pattern: /xox[abpr]-[A-Za-z0-9-]{10,}/g,
    replacement: "<REDACTED:credential>",
    description: "Slack-style token",
  },
  {
    pattern: /ghp_[A-Za-z0-9]{36,}/g,
    replacement: "<REDACTED:credential>",
    description: "GitHub personal access token",
  },
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: "<REDACTED:credential>",
    description: "AWS access key ID",
  },
  // Generic tokens often emitted in error messages
  {
    pattern: /(?<=token[=:][\s"']*)[A-Za-z0-9_-]{20,}/g,
    replacement: "<REDACTED:credential>",
    description: "Generic 'token=' prefix",
  },
  {
    pattern: /(?<=apiKey[=:][\s"']*)[A-Za-z0-9_-]{16,}/g,
    replacement: "<REDACTED:credential>",
    description: "Generic 'apiKey=' prefix",
  },
  // Workspace paths that hint at machine identity
  {
    pattern: /\/Users\/[^/\s]+/g,
    replacement: "<REDACTED:home>",
    description: "macOS home directory path",
  },
  {
    pattern: /\/home\/[^/\s]+/g,
    replacement: "<REDACTED:home>",
    description: "Linux home directory path",
  },
  // Email addresses are NOT redacted by default — pipeline manifests'
  // memory_authority lists them as identities, and they appear in
  // source_identity fields by design. If a pipeline wants to redact
  // emails outside its authority list, add a custom rule.
];

// ─── Apply redaction ───────────────────────────────────────────────────

export interface RedactionOptions {
  readonly extraRules?: ReadonlyArray<RedactionRule>;
}

/**
 * Apply redaction rules to a string. Returns the redacted version.
 * If input is not a string, returns it unchanged.
 */
export function redactString(value: string, options?: RedactionOptions): string {
  let out = value;
  for (const rule of DEFAULT_REDACTION_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  if (options?.extraRules) {
    for (const rule of options.extraRules) {
      out = out.replace(rule.pattern, rule.replacement);
    }
  }
  return out;
}

/**
 * Recursively apply redaction to every string value in a JSON-shaped object.
 * Object keys are NOT redacted (they're typically field names, not data).
 * Arrays are walked; non-string primitives (number/boolean/null) pass through.
 */
export function redactObject<T = unknown>(value: T, options?: RedactionOptions): T {
  return walk(value, options) as T;
}

function walk(value: unknown, options?: RedactionOptions): unknown {
  if (typeof value === "string") {
    return redactString(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, options));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = walk(v, options);
    }
    return out;
  }
  return value;
}

/**
 * Build a single-rule extension set — convenience for pipelines that need
 * one or two custom redaction patterns without managing the full array.
 */
export function customRule(
  pattern: RegExp,
  replacement: string,
  description: string,
): RedactionRule {
  // Force g flag if not present so replace() catches every occurrence.
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  return { pattern: new RegExp(pattern.source, flags), replacement, description };
}
