import { describe, expect, test } from "bun:test";

import { finalizeGatewayResponse } from "./gateway-response";

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
