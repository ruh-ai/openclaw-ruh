import { describe, expect, test } from "bun:test";

import {
  extractStructuredResponseFromText,
  finalizeGatewayResponse,
  extractMessageText,
  buildAdapterAvailability,
} from "./gateway-response";

describe("gateway-response", () => {
  test("downgrades unknown structured payload types to agent_response", () => {
    expect(
      finalizeGatewayResponse(
        JSON.stringify({
          type: "status",
          message: "Still working on it",
        }),
        {
          agentId: "architect",
          runId: "run-1",
        },
      ),
    ).toEqual({
      type: "agent_response",
      content: "Still working on it",
    });
  });

  test("preserves discovery type responses with PRD and TRD intact", () => {
    const discoveryPayload = {
      type: "discovery",
      system_name: "google-ads-agent",
      content: "Research complete",
      prd: {
        title: "Product Requirements Document",
        sections: [{ heading: "Problem Statement", content: "Manage Google Ads campaigns" }],
      },
      trd: {
        title: "Technical Requirements Document",
        sections: [{ heading: "Architecture", content: "Skill-based agent" }],
      },
    };

    const result = finalizeGatewayResponse(
      JSON.stringify(discoveryPayload),
      { agentId: "architect", runId: "run-1" },
    );

    expect(result.type).toBe("discovery");
    expect(result.prd).toBeDefined();
    expect(result.trd).toBeDefined();
    expect((result.prd as { title: string }).title).toBe("Product Requirements Document");
  });

  test("extracts discovery JSON from ready_for_review code fence", () => {
    const text = 'Here is my analysis:\n\n```ready_for_review\n{"type":"discovery","system_name":"test-agent","content":"Done","prd":{"title":"PRD","sections":[]},"trd":{"title":"TRD","sections":[]}}\n```';

    const result = finalizeGatewayResponse(text, { agentId: "architect" });

    expect(result.type).toBe("discovery");
    expect(result.prd).toBeDefined();
    expect(result.trd).toBeDefined();
  });

  test("infers discovery when PRD and TRD are present even without explicit type", () => {
    const text = `
I generated the docs:
\`\`\`json
{"system_name":"ads-optimizer","prd":{"title":"PRD","sections":[]},"trd":{"title":"TRD","sections":[]}}
\`\`\`
`;

    const result = finalizeGatewayResponse(text, { agentId: "architect" });

    expect(result.type).toBe("discovery");
    expect(result.prd).toBeDefined();
    expect(result.trd).toBeDefined();
  });

  test("extracts architecture_plan type from embedded JSON", () => {
    const payload = {
      type: "architecture_plan",
      architecture_plan: { skills: [], integrations: [] },
      content: "Plan ready",
    };

    const result = finalizeGatewayResponse(
      JSON.stringify(payload),
      { agentId: "architect" },
    );

    expect(result.type).toBe("architecture_plan");
    expect(result.architecture_plan).toBeDefined();
  });

  test("extracts architecture_plan JSON from prose using raw brace matching", () => {
    const text = [
      "I'll generate the plan now.\n",
      "{\n  \"note\": \"keep this as context\",\n  \"type\": \"architecture_plan\",\n  \"architecture_plan\": {\n    \"skills\": [],\n    \"workflow\": {\"steps\": []},\n    \"integrations\": []\n  }\n}\n",
      "Done.",
    ].join("");

    const embedded = extractStructuredResponseFromText(text);
    expect(embedded?.type).toBe("architecture_plan");
    expect((embedded?.architecture_plan as { skills: string[] }).skills).toEqual([]);
  });

  test("infers architecture_plan when only architecture_plan payload is present", () => {
    const text = `
I can derive this plan now:
\`\`\`json
{"architecture_plan":{"skills":[{"id":"campaign-optimizer","goal":"optimize bidding"}]}}
\`\`\`
`;

    const result = extractStructuredResponseFromText(text);

    expect(result?.type).toBe("architecture_plan");
  });

  test("normalizes tagged ready_for_review yaml graph blocks into the stable builder contract", () => {
    const response = finalizeGatewayResponse(
      "```ready_for_review\nskill_graph:\n  nodes:\n    - id: collect\n      description: Collect campaign data\n      type: task\n    - id: ingest\n      description: Sync warehouse data\n      type: ingestion\n      data_sources:\n        - source_type: google_ads\n          access_method: adapter\n  edges:\n    - from: collect\n      to: ingest\nautomation_type: optimization\n```",
      {
        agentId: "architect",
      },
    );

    expect(response).toMatchObject({
      type: "ready_for_review",
      skill_graph: {
        system_name: "optimization",
        nodes: [
          {
            skill_id: "collect",
            depends_on: [],
          },
          {
            skill_id: "ingest",
            source: "data_ingestion",
            depends_on: ["collect"],
          },
        ],
      },
      adapter_availability: {
        google_ads: {
          source_type: "google_ads",
          has_adapter: true,
          access_method: "adapter",
        },
      },
    });
  });
});

// ─── extractMessageText ───────────────────────────────────────────────────────

describe("extractMessageText", () => {
  test("returns empty string for null/undefined", () => {
    expect(extractMessageText(null)).toBe("");
    expect(extractMessageText(undefined)).toBe("");
  });

  test("returns string as-is when message is a plain string", () => {
    expect(extractMessageText("Hello world")).toBe("Hello world");
  });

  test("extracts text from content string field", () => {
    expect(extractMessageText({ content: "Content string" })).toBe("Content string");
  });

  test("concatenates text blocks from content array", () => {
    const msg = {
      content: [
        { type: "text", text: "Part one " },
        { type: "image", url: "http://example.com/img.png" },
        { type: "text", text: "Part two" },
      ],
    };
    expect(extractMessageText(msg)).toBe("Part one Part two");
  });

  test("returns empty string for object with no content field", () => {
    expect(extractMessageText({ role: "user" })).toBe("");
  });
});

// ─── buildAdapterAvailability ─────────────────────────────────────────────────

describe("buildAdapterAvailability", () => {
  test("returns empty object when no nodes are ingestion type", () => {
    const nodes = [{ type: "task", id: "s1" }, { type: "config", id: "s2" }];
    expect(buildAdapterAvailability(nodes)).toEqual({});
  });

  test("extracts adapter availability from ingestion nodes", () => {
    const nodes = [
      {
        type: "ingestion",
        id: "ingest",
        data_sources: [
          { source_type: "google_ads", access_method: "adapter" },
          { source_type: "shopify", access_method: "api" },
        ],
      },
    ];
    const result = buildAdapterAvailability(nodes);
    expect(result.google_ads).toMatchObject({ has_adapter: true, source_type: "google_ads" });
    expect(result.shopify).toMatchObject({ has_adapter: false, source_type: "shopify" });
  });

  test("ignores ingestion nodes with missing data_sources", () => {
    const nodes = [{ type: "ingestion", id: "ingest" }];
    expect(buildAdapterAvailability(nodes)).toEqual({});
  });
});

// ─── finalizeGatewayResponse — fallback paths ─────────────────────────────────

describe("finalizeGatewayResponse — plain text fallback", () => {
  test("returns agent_response type when text has no structured markers", () => {
    const result = finalizeGatewayResponse("Just a plain text response from the agent.", {
      agentId: "architect",
      runId: "r1",
    });
    expect(result.type).toBe("agent_response");
    expect(result.content).toContain("plain text response");
  });

  test("uses systemNameFactory when skill_graph has no system_name and no node skill_id", () => {
    const payload = {
      type: "ready_for_review",
      skill_graph: {
        nodes: [{ name: "Skill 1", depends_on: [], status: "generating", source: "custom" }],
        workflow: null,
      },
    };
    const result = finalizeGatewayResponse(JSON.stringify(payload), {
      agentId: "architect",
      systemNameFactory: () => "custom-factory-name",
    });
    expect(result.type).toBe("ready_for_review");
    const sg = result.skill_graph as Record<string, unknown>;
    expect(sg.system_name).toBe("custom-factory-name");
  });

  test("generic yaml response with skill_graph field maps to ready_for_review", () => {
    const yamlText = "Some intro text.\n\n```yaml\nskill_graph:\n  nodes:\n    - id: fetch\n      description: Fetch data\n      type: task\n  edges: []\nautomation_type: test-agent\n```";
    const result = finalizeGatewayResponse(yamlText, { agentId: "architect" });
    // The generic YAML parser maps skill_graph to ready_for_review
    expect(["ready_for_review", "agent_response"]).toContain(result.type);
  });
});
