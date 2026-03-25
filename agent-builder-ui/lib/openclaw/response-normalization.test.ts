import { describe, expect, test } from "bun:test";
import { normalizeArchitectResponse } from "./response-normalization";

describe("normalizeArchitectResponse", () => {
  test("maps newer clarification question types to the builder-supported set", () => {
    const result = normalizeArchitectResponse({
      type: "clarification",
      context: "Need a few last details.",
      questions: [
        {
          id: "approval",
          question: "Do you want me to continue?",
          type: "confirm",
          required: true,
        },
        {
          id: "notes",
          question: "Anything else to know?",
          type: "info",
          placeholder: "Optional notes",
        },
      ],
    });

    expect(result).toMatchObject({
      type: "clarification",
      questions: [
        {
          id: "approval",
          question: "Do you want me to continue?",
          type: "boolean",
          required: true,
        },
        {
          id: "notes",
          question: "Anything else to know?",
          type: "text",
          placeholder: "Optional notes",
        },
      ],
    });
  });

  test("turns data schema proposals into a supported clarification response", () => {
    const result = normalizeArchitectResponse({
      type: "data_schema_proposal",
      context: "The architect wants approval before adding storage.",
      data_schema: {
        should_persist: false,
      },
    });

    expect(result).toMatchObject({
      type: "clarification",
      context: "The architect wants approval before adding storage.",
      questions: [
        {
          id: "schema-approval",
          type: "select",
          required: true,
          options: [
            "Approve the schema/storage plan and continue.",
            "Revise the schema/storage plan before continuing.",
          ],
        },
      ],
    });
  });

  test("converts the newer ready_for_review payload into the legacy skill graph shape", () => {
    const result = normalizeArchitectResponse({
      type: "ready_for_review",
      system_name: "spec-draft-assistant",
      workflow: {
        orchestration: "Ask follow-up questions, then draft a concise product spec.",
      },
      skill_graph: [
        {
          skill_id: "clarify_requirements",
          name: "Clarify requirements",
          purpose: "Ask follow-up questions when the request is ambiguous.",
          tool_source: "native",
          native_tools: ["chat"],
        },
        {
          skill_id: "draft_spec",
          name: "Draft spec",
          purpose: "Turn the request into a markdown spec.",
          implementation: "new",
        },
      ],
    });

    expect(result).toMatchObject({
      type: "ready_for_review",
      system_name: "spec-draft-assistant",
      skill_graph: {
        system_name: "spec-draft-assistant",
        nodes: [
          {
            skill_id: "clarify_requirements",
            name: "Clarify requirements",
            source: "native_tool",
            status: "always_included",
            depends_on: [],
            native_tool: "chat",
          },
          {
            skill_id: "draft_spec",
            name: "Draft spec",
            source: "custom",
            status: "generated",
            depends_on: ["clarify_requirements"],
          },
        ],
        workflow: {
          name: "spec-draft-assistant-workflow",
          description: "Ask follow-up questions, then draft a concise product spec.",
          steps: [
            {
              id: "step-0",
              action: "execute",
              skill: "clarify_requirements",
              wait_for: [],
            },
            {
              id: "step-1",
              action: "execute",
              skill: "draft_spec",
              wait_for: ["clarify_requirements"],
            },
          ],
        },
      },
    });
  });

  test("preserves explicit workflow wait_for dependencies from newer ready_for_review payloads", () => {
    const result = normalizeArchitectResponse({
      type: "ready_for_review",
      system_name: "parallel-review-assistant",
      workflow: {
        orchestration: "Collect context, then run summary and publish in parallel.",
        steps: [
          {
            skill: "collect",
            wait_for: [],
          },
          {
            skill: "summarize",
            wait_for: ["collect"],
          },
          {
            skill: "publish",
            wait_for: ["collect"],
          },
        ],
      },
      skill_graph: [
        {
          skill_id: "collect",
          name: "Collect context",
          purpose: "Gather the required source material.",
          implementation: "existing",
        },
        {
          skill_id: "summarize",
          name: "Summarize findings",
          purpose: "Turn the collected material into a concise summary.",
          implementation: "new",
        },
        {
          skill_id: "publish",
          name: "Publish update",
          purpose: "Send the approved update to the destination channel.",
          implementation: "new",
        },
      ],
    });

    expect(result).toMatchObject({
      type: "ready_for_review",
      system_name: "parallel-review-assistant",
      skill_graph: {
        nodes: [
          {
            skill_id: "collect",
            depends_on: [],
            source: "existing",
          },
          {
            skill_id: "summarize",
            depends_on: ["collect"],
          },
          {
            skill_id: "publish",
            depends_on: ["collect"],
          },
        ],
        workflow: {
          steps: [
            {
              id: "step-0",
              skill: "collect",
              wait_for: [],
            },
            {
              id: "step-1",
              skill: "summarize",
              wait_for: ["collect"],
            },
            {
              id: "step-2",
              skill: "publish",
              wait_for: ["collect"],
            },
          ],
        },
      },
    });
  });
});
