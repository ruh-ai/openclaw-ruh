import { describe, expect, test } from "bun:test";

import {
  buildTriggerSelections,
  createTriggerCatalog,
  detectSuggestedTriggerIds,
  summarizeTriggerSelections,
} from "./trigger-catalog";
import type { TriggerSelection } from "./types";

describe("trigger-catalog", () => {
  test("marks cron schedule and webhook POST as deployable in the create-flow catalog", () => {
    const catalog = createTriggerCatalog();
    const supportedIds = catalog
      .flatMap((category) => category.triggers)
      .filter((trigger) => trigger.status === "supported")
      .map((trigger) => trigger.id);

    expect(supportedIds).toEqual(["cron-schedule", "webhook-post"]);
  });

  test("suggests a supported schedule trigger and never falls back to chat-command", () => {
    expect(
      detectSuggestedTriggerIds([
        "Runs every weekday at 9am for the paid media team",
      ]),
    ).toEqual(["cron-schedule"]);

    expect(
      detectSuggestedTriggerIds([
        "Respond to Slack questions from campaign managers",
      ]),
    ).toEqual([]);
  });

  test("preserves truthful supported and unsupported trigger metadata for save and reopen flows", () => {
    const initialSelections: TriggerSelection[] = [
      {
        id: "cron-schedule",
        title: "Weekday pacing check",
        kind: "schedule",
        status: "supported",
        description: "Runs every weekday at 9 AM.",
        schedule: "0 9 * * 1-5",
      },
      {
        id: "webhook-post",
        title: "Webhook POST",
        kind: "webhook",
        status: "supported",
        description: "Accepts signed HTTP POST events.",
      },
    ];

    const rebuiltSelections = buildTriggerSelections(
      new Set(["cron-schedule", "webhook-post"]),
      initialSelections,
    );

    expect(rebuiltSelections).toEqual(initialSelections);
    expect(summarizeTriggerSelections(rebuiltSelections)).toEqual({
      supported: 2,
      unsupported: 0,
    });
  });

  test("falls back to the default weekday cron when a reopened saved schedule is blank", () => {
    const rebuiltSelections = buildTriggerSelections(
      new Set(["cron-schedule"]),
      [
        {
          id: "cron-schedule",
          title: "   ",
          kind: "schedule",
          status: "supported",
          description: "   ",
          schedule: "   ",
        },
      ],
    );

    expect(rebuiltSelections).toEqual([
      {
        id: "cron-schedule",
        title: "Cron Schedule",
        kind: "schedule",
        status: "supported",
        description: "Runs on a fixed time schedule",
        schedule: "0 9 * * 1-5",
      },
    ]);
  });

  test("normalizes legacy chat-command selections to unsupported on reopen", () => {
    const rebuiltSelections = buildTriggerSelections(
      new Set(["chat-command"]),
      [
        {
          id: "chat-command",
          title: "Chat Command",
          kind: "manual",
          status: "supported",
          description: "Legacy saved trigger from the old mock picker.",
        },
      ],
    );

    expect(rebuiltSelections).toEqual([
      {
        id: "chat-command",
        title: "Chat Command",
        kind: "manual",
        status: "unsupported",
        description: "Legacy saved trigger from the old mock picker.",
      },
    ]);
  });

  test("normalizes legacy generic webhook selections to unsupported on reopen", () => {
    const rebuiltSelections = buildTriggerSelections(
      new Set(["webhook"]),
      [
        {
          id: "webhook",
          title: "Instant webhook",
          kind: "webhook",
          status: "supported",
          description: "Legacy saved trigger before runtime-backed webhook ids existed.",
        },
      ],
    );

    expect(rebuiltSelections).toEqual([
      {
        id: "webhook",
        title: "Instant webhook",
        kind: "webhook",
        status: "unsupported",
        description: "Legacy saved trigger before runtime-backed webhook ids existed.",
      },
    ]);
  });
});
