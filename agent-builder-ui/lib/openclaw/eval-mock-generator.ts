/**
 * eval-mock-generator.ts — generates mock API service definitions and data
 * for agent evaluation without requiring real credentials or live API access.
 *
 * Two modes:
 *   1. Deterministic: generates mock schemas + sample data from tool connections
 *   2. LLM-powered: asks the architect to generate realistic mock data
 */

import type { SkillGraphNode, ArchitecturePlan } from "./types";
import type { AgentToolConnection, AgentRuntimeInput } from "@/lib/agents/types";
import { sendToArchitectStreaming } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MockEndpoint {
  method: string;
  path: string;
  description: string;
  responseSchema: Record<string, unknown>;
  sampleResponse: Record<string, unknown>;
}

export interface MockServiceDefinition {
  serviceId: string;
  serviceName: string;
  description: string;
  baseUrl: string;
  authType: string;
  endpoints: MockEndpoint[];
  envOverrides: Record<string, string>;
}

export interface MockContext {
  services: MockServiceDefinition[];
  envOverrides: Record<string, string>;
}

// ── Well-known API mock templates ────────────────────────────────────────────

const API_TEMPLATES: Record<string, () => MockServiceDefinition> = {
  "google-ads": () => ({
    serviceId: "google-ads",
    serviceName: "Google Ads API (Mock)",
    description: "Mock Google Ads API returning realistic campaign, ad group, and keyword data",
    baseUrl: "https://mock-googleads.eval.local",
    authType: "oauth",
    endpoints: [
      {
        method: "POST",
        path: "/v17/customers/{customer_id}/googleAds:searchStream",
        description: "Search stream for campaign/ad group/keyword metrics",
        responseSchema: { type: "array", items: { type: "object", properties: { campaign: {}, metrics: {} } } },
        sampleResponse: {
          results: [
            {
              campaign: { id: "14832957610", name: "Brand Awareness - US", status: "ENABLED" },
              metrics: { impressions: 45230, clicks: 1847, ctr: 0.0408, cost_micros: 285400000, conversions: 89, cost_per_conversion_micros: 3206741 },
            },
            {
              campaign: { id: "14832957611", name: "Product Launch - Q1", status: "ENABLED" },
              metrics: { impressions: 28910, clicks: 1203, ctr: 0.0416, cost_micros: 198700000, conversions: 52, cost_per_conversion_micros: 3821153 },
            },
            {
              campaign: { id: "14832957612", name: "Retargeting - Cart Abandoners", status: "PAUSED" },
              metrics: { impressions: 12450, clicks: 892, ctr: 0.0717, cost_micros: 95300000, conversions: 41, cost_per_conversion_micros: 2324390 },
            },
          ],
        },
      },
      {
        method: "POST",
        path: "/v17/customers/{customer_id}/campaigns:mutate",
        description: "Mutate campaigns (update status, budget, bid strategy)",
        responseSchema: { type: "object", properties: { results: { type: "array" } } },
        sampleResponse: {
          results: [{ resourceName: "customers/1234567890/campaigns/14832957610", campaign: { status: "ENABLED" } }],
        },
      },
    ],
    envOverrides: {
      GOOGLE_ADS_API_URL: "https://mock-googleads.eval.local",
      GOOGLE_ADS_DEVELOPER_TOKEN: "MOCK_DEV_TOKEN_eval_mode",
      GOOGLE_ADS_CUSTOMER_ID: "1234567890",
      GOOGLE_ADS_REFRESH_TOKEN: "MOCK_REFRESH_TOKEN",
    },
  }),

  zendesk: () => ({
    serviceId: "zendesk",
    serviceName: "Zendesk API (Mock)",
    description: "Mock Zendesk API returning realistic tickets, articles, and user data",
    baseUrl: "https://mock-zendesk.eval.local",
    authType: "api_key",
    endpoints: [
      {
        method: "GET",
        path: "/api/v2/search.json",
        description: "Search tickets, articles, and users",
        responseSchema: { type: "object", properties: { results: { type: "array" }, count: { type: "number" } } },
        sampleResponse: {
          results: [
            { id: 40912, type: "ticket", subject: "Cannot reset password", status: "open", priority: "normal", requester_id: 8923 },
            { id: 40913, type: "ticket", subject: "Double charged for subscription", status: "open", priority: "high", requester_id: 8924 },
          ],
          count: 2,
        },
      },
      {
        method: "GET",
        path: "/api/v2/help_center/articles/search.json",
        description: "Search knowledge base articles",
        responseSchema: { type: "object", properties: { results: { type: "array" } } },
        sampleResponse: {
          results: [
            { id: 206388, title: "How to reset your password", body: "Step 1: Go to settings. Step 2: Click 'Reset Password'...", section_id: 1001 },
            { id: 206389, title: "Billing FAQ", body: "Q: What if I was charged twice? A: Contact support with your receipt number...", section_id: 1002 },
          ],
        },
      },
      {
        method: "POST",
        path: "/api/v2/tickets.json",
        description: "Create a new support ticket",
        responseSchema: { type: "object", properties: { ticket: { type: "object" } } },
        sampleResponse: {
          ticket: { id: 40920, status: "new", priority: "normal", subject: "New ticket created via agent" },
        },
      },
    ],
    envOverrides: {
      ZENDESK_SUBDOMAIN: "mock-company",
      ZENDESK_API_TOKEN: "MOCK_API_TOKEN_eval_mode",
      ZENDESK_EMAIL: "agent@mock-company.zendesk.com",
    },
  }),

  slack: () => ({
    serviceId: "slack",
    serviceName: "Slack API (Mock)",
    description: "Mock Slack API for message posting and channel operations",
    baseUrl: "https://mock-slack.eval.local",
    authType: "oauth",
    endpoints: [
      {
        method: "POST",
        path: "/api/chat.postMessage",
        description: "Post a message to a channel",
        responseSchema: { type: "object", properties: { ok: { type: "boolean" }, ts: { type: "string" } } },
        sampleResponse: { ok: true, channel: "C024BE91L", ts: "1712345678.000100", message: { text: "Message posted by agent" } },
      },
    ],
    envOverrides: {
      SLACK_BOT_TOKEN: "xoxb-MOCK-TOKEN-eval-mode",
      SLACK_CHANNEL_ID: "C024BE91L",
    },
  }),
};

// ── Keyword-based API detection ──────────────────────────────────────────────

const API_DETECTION_KEYWORDS: Record<string, string[]> = {
  "google-ads": ["google ads", "google_ads", "googleads", "adwords", "campaign", "ad group"],
  zendesk: ["zendesk", "support ticket", "help center", "help_center"],
  slack: ["slack", "slack_bot", "slack bot"],
  freshdesk: ["freshdesk"],
  hubspot: ["hubspot", "crm"],
  stripe: ["stripe", "payment", "billing"],
  shopify: ["shopify", "ecommerce", "e-commerce"],
  github: ["github", "repository", "pull request"],
  jira: ["jira", "atlassian", "issue tracker"],
  salesforce: ["salesforce", "sfdc"],
};

function detectApiServices(
  skills: SkillGraphNode[],
  toolConnections: AgentToolConnection[],
  plan: ArchitecturePlan | null,
): string[] {
  const detected = new Set<string>();
  const searchText = [
    ...skills.map((s) => `${s.name} ${s.description ?? ""} ${s.external_api ?? ""}`),
    ...toolConnections.map((t) => `${t.name} ${t.description}`),
    ...(plan?.integrations?.map((i) => `${i.name} ${i.toolId}`) ?? []),
  ].join(" ").toLowerCase();

  for (const [apiId, keywords] of Object.entries(API_DETECTION_KEYWORDS)) {
    if (keywords.some((kw) => searchText.includes(kw))) {
      detected.add(apiId);
    }
  }

  return Array.from(detected);
}

// ── Deterministic mock generation ────────────────────────────────────────────

export interface MockGenerationConfig {
  skillGraph: SkillGraphNode[];
  toolConnections: AgentToolConnection[];
  runtimeInputs: AgentRuntimeInput[];
  architecturePlan: ArchitecturePlan | null;
}

export function generateDeterministicMocks(config: MockGenerationConfig): MockContext {
  const detectedApis = detectApiServices(config.skillGraph, config.toolConnections, config.architecturePlan);
  const services: MockServiceDefinition[] = [];
  const envOverrides: Record<string, string> = {};

  // Use templates for well-known APIs
  for (const apiId of detectedApis) {
    const template = API_TEMPLATES[apiId];
    if (template) {
      const service = template();
      services.push(service);
      Object.assign(envOverrides, service.envOverrides);
    }
  }

  // Generate generic mocks for unknown tool connections
  for (const tool of config.toolConnections) {
    const toolIdNorm = tool.toolId.toLowerCase().replace(/[^a-z0-9]/g, "-");
    if (services.some((s) => s.serviceId === toolIdNorm)) continue;
    if (detectedApis.some((api) => toolIdNorm.includes(api))) continue;

    services.push({
      serviceId: toolIdNorm,
      serviceName: `${tool.name} (Mock)`,
      description: `Auto-generated mock for ${tool.name}: ${tool.description}`,
      baseUrl: `https://mock-${toolIdNorm}.eval.local`,
      authType: tool.authKind,
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/data",
          description: `Fetch data from ${tool.name}`,
          responseSchema: { type: "object", properties: { data: { type: "array" }, total: { type: "number" } } },
          sampleResponse: { data: [{ id: 1, name: "Sample item", status: "active", created_at: "2026-03-28T10:00:00Z" }], total: 1 },
        },
        {
          method: "POST",
          path: "/api/v1/actions",
          description: `Execute action on ${tool.name}`,
          responseSchema: { type: "object", properties: { success: { type: "boolean" }, action_id: { type: "string" } } },
          sampleResponse: { success: true, action_id: "act_mock_001", message: "Action executed successfully" },
        },
      ],
      envOverrides: {},
    });
  }

  // Generate env overrides for runtime inputs that look like credentials
  for (const input of config.runtimeInputs) {
    if (input.key.match(/token|key|secret|password|credential/i) && !envOverrides[input.key]) {
      envOverrides[input.key] = `MOCK_${input.key.toUpperCase()}_eval_mode`;
    }
  }

  return { services, envOverrides };
}

// ── LLM-powered mock generation ──────────────────────────────────────────────

function buildMockGenerationPrompt(config: MockGenerationConfig, detectedApis: string[]): string {
  const toolList = config.toolConnections
    .map((t) => `- ${t.name} (${t.connectorType}): ${t.description}`)
    .join("\n") || "- No explicit tool connections defined";

  const skillList = config.skillGraph
    .map((s) => `- ${s.name}: ${s.description ?? "no description"}${s.external_api ? ` [API: ${s.external_api}]` : ""}`)
    .join("\n");

  const envVars = config.runtimeInputs
    .map((i) => `- ${i.key}: ${i.description}${i.required ? " (required)" : ""}`)
    .join("\n") || "- None";

  return `You are generating mock API service definitions for agent evaluation. The agent needs to be tested without real API credentials.

## Agent Configuration

### Skills
${skillList}

### Tool Connections
${toolList}

### Environment Variables
${envVars}

### Detected API Services
${detectedApis.length > 0 ? detectedApis.join(", ") : "None detected — infer from skills"}

## Task

Generate realistic mock service definitions as a JSON array. Each service should have:
1. Realistic endpoint paths matching the real API
2. Sample response data that exercises the agent's skills
3. Data that covers edge cases (empty results, errors, pagination)
4. Environment variable overrides (mock credentials)

**The mock data should be realistic enough that the agent's reasoning and workflow can be fully evaluated.**

**Output format — return ONLY a JSON array:**
\`\`\`json
[
  {
    "serviceId": "kebab-case-id",
    "serviceName": "Human Readable Name (Mock)",
    "description": "What this mock covers",
    "endpoints": [
      {
        "method": "GET|POST|PUT|DELETE",
        "path": "/api/v1/resource",
        "description": "What this endpoint does",
        "sampleResponse": { ... realistic data ... }
      }
    ],
    "envOverrides": {
      "API_KEY": "MOCK_VALUE"
    }
  }
]
\`\`\`

Return ONLY the JSON array.`;
}

function parseMockServiceResponse(content: string): MockServiceDefinition[] {
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: Record<string, unknown>) => item.serviceId && item.endpoints)
      .map((item: Record<string, unknown>) => ({
        serviceId: String(item.serviceId),
        serviceName: String(item.serviceName ?? item.serviceId),
        description: String(item.description ?? ""),
        baseUrl: String(item.baseUrl ?? `https://mock-${item.serviceId}.eval.local`),
        authType: String(item.authType ?? "api_key"),
        endpoints: Array.isArray(item.endpoints)
          ? (item.endpoints as Record<string, unknown>[]).map((ep) => ({
              method: String(ep.method ?? "GET"),
              path: String(ep.path ?? "/api/v1/data"),
              description: String(ep.description ?? ""),
              responseSchema: (ep.responseSchema as Record<string, unknown>) ?? {},
              sampleResponse: (ep.sampleResponse as Record<string, unknown>) ?? {},
            }))
          : [],
        envOverrides: (item.envOverrides as Record<string, string>) ?? {},
      }));
  } catch {
    return [];
  }
}

export async function generateLLMMocks(
  sessionId: string,
  config: MockGenerationConfig,
  options?: { signal?: AbortSignal },
): Promise<MockContext> {
  const detectedApis = detectApiServices(config.skillGraph, config.toolConnections, config.architecturePlan);
  const prompt = buildMockGenerationPrompt(config, detectedApis);
  let accumulated = "";

  const response = await sendToArchitectStreaming(
    sessionId,
    prompt,
    { onDelta: (text) => { accumulated += text; } },
    { mode: "test", signal: options?.signal },
  );

  const content = response.content || accumulated;
  const services = parseMockServiceResponse(content);

  if (services.length === 0) {
    // Fallback to deterministic
    return generateDeterministicMocks(config);
  }

  const envOverrides: Record<string, string> = {};
  for (const svc of services) {
    Object.assign(envOverrides, svc.envOverrides);
  }

  return { services, envOverrides };
}

// ── Build soul override with mock context ────────────────────────────────────

export function buildMockModeInstruction(mockContext: MockContext): string {
  if (mockContext.services.length === 0) return "";

  const serviceBlocks = mockContext.services.map((svc) => {
    const endpoints = svc.endpoints.map((ep) =>
      `  ${ep.method} ${ep.path}\n  Response: ${JSON.stringify(ep.sampleResponse, null, 2).split("\n").map((l, i) => i === 0 ? l : `  ${l}`).join("\n")}`,
    ).join("\n\n");

    return `### ${svc.serviceName}
${svc.description}

${endpoints}`;
  }).join("\n\n");

  return `## MOCK MODE — USE THESE API RESPONSES

You are running in **evaluation mock mode**. Do NOT make real API calls. Instead, use the mock data below as if it came from the real APIs. Process this data exactly as you would process real API responses — apply your skills, reasoning, and workflow to it.

${serviceBlocks}

## Environment Variables (Mock)
${Object.entries(mockContext.envOverrides).map(([k, v]) => `${k}=${v}`).join("\n")}

**Important:** Treat this mock data as real. Run your full skill workflow against it. Show the user what you would do with this data.`;
}
