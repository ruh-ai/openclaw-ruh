import type { SkillGraphNode, ArchitecturePlanEnvVar } from "@/lib/openclaw/types";
import type { AgentRuntimeInput } from "./types";

const RUNTIME_INPUT_DETAILS: Record<string, { label: string; description: string }> = {
  GOOGLE_ADS_CUSTOMER_ID: {
    label: "Google Ads Customer ID",
    description: "Google Ads customer ID for the target account.",
  },
};

function humanizeKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getRuntimeInputDetails(key: string): { label: string; description: string } {
  const trimmedKey = key.trim().toUpperCase();
  return (
    RUNTIME_INPUT_DETAILS[trimmedKey] ?? {
      label: humanizeKey(trimmedKey),
      description: `${humanizeKey(trimmedKey)} required at runtime.`,
    }
  );
}

export function extractRuntimeInputKeys({
  skillGraph,
  agentRules,
}: {
  skillGraph?: SkillGraphNode[] | null;
  agentRules?: string[];
}): string[] {
  const keys = new Set<string>();

  for (const rule of agentRules ?? []) {
    if (!rule.toLowerCase().startsWith("requires env")) {
      continue;
    }
    const [, rawKeys = ""] = rule.split(":");
    for (const key of rawKeys.split(",").map((value) => value.trim()).filter(Boolean)) {
      keys.add(key.toUpperCase());
    }
  }

  for (const node of skillGraph ?? []) {
    for (const key of node.requires_env ?? []) {
      const trimmed = key.trim();
      if (trimmed) {
        keys.add(trimmed.toUpperCase());
      }
    }
  }

  return Array.from(keys);
}

export function mergeRuntimeInputDefinitions({
  existing,
  skillGraph,
  agentRules,
}: {
  existing?: AgentRuntimeInput[];
  skillGraph?: SkillGraphNode[] | null;
  agentRules?: string[];
}): AgentRuntimeInput[] {
  const keys = extractRuntimeInputKeys({ skillGraph, agentRules });
  const existingByKey = new Map(
    (existing ?? []).map((input) => [input.key.trim().toUpperCase(), input]),
  );

  const merged: AgentRuntimeInput[] = keys.map((key) => {
    const current = existingByKey.get(key);
    const details = getRuntimeInputDetails(key);
    return {
      key,
      label: current?.label?.trim() || details.label,
      description: current?.description?.trim() || details.description,
      required: current?.required ?? true,
      source: current?.source ?? "architect_requirement",
      value: current?.value ?? "",
      // Propagate enriched metadata
      inputType: current?.inputType,
      defaultValue: current?.defaultValue,
      example: current?.example,
      options: current?.options,
      group: current?.group,
      populationStrategy: current?.populationStrategy,
    } satisfies AgentRuntimeInput;
  });

  for (const input of existing ?? []) {
    const key = input.key.trim().toUpperCase();
    if (!keys.includes(key)) {
      merged.push({ ...input, key });
    }
  }

  return merged;
}

/**
 * Enrich runtime inputs with metadata from the architecture plan's envVars.
 * The architect provides human-readable labels, descriptions, input types,
 * defaults, examples, and groups that the bare key-extraction misses.
 */
export function enrichRuntimeInputsFromPlan(
  inputs: AgentRuntimeInput[],
  planEnvVars: ArchitecturePlanEnvVar[] | undefined,
): AgentRuntimeInput[] {
  if (!planEnvVars?.length) return inputs;
  const planByKey = new Map(planEnvVars.map((ev) => [ev.key.toUpperCase(), ev]));
  return inputs.map((input) => {
    const plan = planByKey.get(input.key.toUpperCase());
    if (!plan) return input;
    return {
      ...input,
      label: plan.label || input.label,
      description: plan.description || input.description,
      inputType: input.inputType ?? plan.inputType,
      defaultValue: input.defaultValue ?? plan.defaultValue,
      example: input.example ?? plan.example,
      options: input.options ?? plan.options,
      group: input.group ?? plan.group,
      populationStrategy: input.populationStrategy ?? plan.populationStrategy,
    };
  });
}

export function isRuntimeInputFilled(input: AgentRuntimeInput): boolean {
  return input.value.trim().length > 0 || (input.defaultValue?.trim().length ?? 0) > 0;
}

export function hasMissingRequiredInputs(agent: {
  runtimeInputs?: AgentRuntimeInput[];
  skillGraph?: SkillGraphNode[] | null;
  agentRules?: string[];
}): boolean {
  const resolved = mergeRuntimeInputDefinitions({
    existing: agent.runtimeInputs,
    skillGraph: agent.skillGraph,
    agentRules: agent.agentRules,
  });
  return resolved.some(
    (input) =>
      input.required &&
      (input.populationStrategy ?? "user_required") === "user_required" &&
      !isRuntimeInputFilled(input),
  );
}
