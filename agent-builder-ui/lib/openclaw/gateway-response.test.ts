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
