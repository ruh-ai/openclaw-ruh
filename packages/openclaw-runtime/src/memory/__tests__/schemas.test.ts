import { describe, expect, test } from "bun:test";
import {
  AttestedMemoryWriteRequestSchema,
  ClientMemoryWriteSubmissionSchema,
  MemoryAuthoritySchema,
  MemoryEntrySchema,
  MemoryQueryFilterSchema,
  parseClientSubmission,
} from "../schemas";

const validContent = {
  type: "feedback" as const,
  title: "LOXON masonry",
  description: "Use LOXON family on brick clubhouses",
  body: "Tier-2 finding from Scott...",
};

describe("ClientMemoryWriteSubmissionSchema", () => {
  test("accepts a valid client submission", () => {
    const ok = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 2,
      lane: "estimating",
      content: validContent,
    });
    expect(ok.success).toBe(true);
  });

  test("rejects client-supplied source_identity (the attestation guard)", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 2,
      lane: "estimating",
      content: validContent,
      source_identity: "spoof@evil.com",
    });
    expect(r.success).toBe(false);
  });

  test("rejects extra fields generally (.strict())", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 2,
      lane: "estimating",
      content: validContent,
      whatever: "no",
    });
    expect(r.success).toBe(false);
  });

  test("rejects non-kebab-case lane", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 2,
      lane: "Estimating",
      content: validContent,
    });
    expect(r.success).toBe(false);
  });

  test("rejects tier outside {1,2,3}", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 4,
      lane: "estimating",
      content: validContent,
    });
    expect(r.success).toBe(false);
  });

  test("rejects content with extra field", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 1,
      lane: "estimating",
      content: { ...validContent, extra: "no" },
    });
    expect(r.success).toBe(false);
  });

  test("rejects empty body", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 1,
      lane: "estimating",
      content: { ...validContent, body: "" },
    });
    expect(r.success).toBe(false);
  });

  test("description longer than 200 chars rejected", () => {
    const r = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 1,
      lane: "estimating",
      content: { ...validContent, description: "x".repeat(201) },
    });
    expect(r.success).toBe(false);
  });

  test("optional id must be kebab-case when provided", () => {
    const ok = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 1,
      lane: "estimating",
      content: validContent,
      id: "loxon-masonry",
    });
    expect(ok.success).toBe(true);

    const bad = ClientMemoryWriteSubmissionSchema.safeParse({
      tier: 1,
      lane: "estimating",
      content: validContent,
      id: "Loxon_Masonry",
    });
    expect(bad.success).toBe(false);
  });

  test("parseClientSubmission throws on bad input", () => {
    expect(() =>
      parseClientSubmission({
        tier: 1,
        lane: "estimating",
        content: validContent,
        source_identity: "spoof",
      }),
    ).toThrow();
  });
});

describe("AttestedMemoryWriteRequestSchema", () => {
  test("accepts attested request with source_identity + source_channel", () => {
    const r = AttestedMemoryWriteRequestSchema.safeParse({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "email",
      content: validContent,
    });
    expect(r.success).toBe(true);
  });

  test("rejects missing source_identity", () => {
    const r = AttestedMemoryWriteRequestSchema.safeParse({
      tier: 2,
      lane: "estimating",
      source_channel: "email",
      content: validContent,
    });
    expect(r.success).toBe(false);
  });

  test("rejects unknown source_channel", () => {
    const r = AttestedMemoryWriteRequestSchema.safeParse({
      tier: 2,
      lane: "estimating",
      source_identity: "scott@ecc.com",
      source_channel: "carrier-pigeon",
      content: validContent,
    });
    expect(r.success).toBe(false);
  });
});

describe("MemoryEntrySchema", () => {
  const baseEntry = {
    id: "loxon-masonry",
    type: "feedback" as const,
    title: "LOXON masonry",
    description: "Use LOXON",
    tier: 2,
    lane: "estimating",
    source_identity: "scott@ecc.com",
    source_channel: "email" as const,
    status: "flagged" as const,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    spec_version: "1.0.0-rc.1",
  };

  test("valid entry passes", () => {
    expect(MemoryEntrySchema.safeParse(baseEntry).success).toBe(true);
  });

  test("invalid status rejected", () => {
    const r = MemoryEntrySchema.safeParse({ ...baseEntry, status: "rejected" });
    expect(r.success).toBe(false);
  });

  test("invalid spec_version pattern rejected", () => {
    const r = MemoryEntrySchema.safeParse({ ...baseEntry, spec_version: "v1" });
    expect(r.success).toBe(false);
  });

  test("optional supersedes/related accept kebab-case ids", () => {
    const r = MemoryEntrySchema.safeParse({
      ...baseEntry,
      supersedes: ["older-entry"],
      related: ["sibling-entry"],
    });
    expect(r.success).toBe(true);
  });

  test("supersedes with non-kebab-case rejected", () => {
    const r = MemoryEntrySchema.safeParse({
      ...baseEntry,
      supersedes: ["BadId"],
    });
    expect(r.success).toBe(false);
  });
});

describe("MemoryAuthoritySchema", () => {
  test("accepts a valid authority list", () => {
    const r = MemoryAuthoritySchema.safeParse([
      { tier: 1, lane: "estimating", writers: ["a@x"] },
      { tier: 2, lane: "estimating", writers: ["b@x", "c@x"] },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects empty writers array", () => {
    const r = MemoryAuthoritySchema.safeParse([
      { tier: 1, lane: "x", writers: [] },
    ]);
    expect(r.success).toBe(false);
  });

  test("rejects duplicate writers in one row", () => {
    const r = MemoryAuthoritySchema.safeParse([
      { tier: 1, lane: "x", writers: ["a", "a"] },
    ]);
    expect(r.success).toBe(false);
  });

  test("rejects unknown row field", () => {
    const r = MemoryAuthoritySchema.safeParse([
      { tier: 1, lane: "x", writers: ["a"], extra: 1 },
    ]);
    expect(r.success).toBe(false);
  });
});

describe("MemoryQueryFilterSchema", () => {
  test("accepts confirmed | permanent in statuses", () => {
    const r = MemoryQueryFilterSchema.safeParse({
      statuses: ["confirmed", "permanent"],
    });
    expect(r.success).toBe(true);
  });

  test("rejects flagged in statuses (visibility guard)", () => {
    const r = MemoryQueryFilterSchema.safeParse({ statuses: ["flagged"] });
    expect(r.success).toBe(false);
  });

  test("rejects proposed in statuses", () => {
    const r = MemoryQueryFilterSchema.safeParse({ statuses: ["proposed"] });
    expect(r.success).toBe(false);
  });

  test("rejects deprecated in statuses", () => {
    const r = MemoryQueryFilterSchema.safeParse({ statuses: ["deprecated"] });
    expect(r.success).toBe(false);
  });

  test("accepts empty filter (defaults handled by facade)", () => {
    const r = MemoryQueryFilterSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  test("rejects extra fields", () => {
    const r = MemoryQueryFilterSchema.safeParse({ types: ["project"], extra: 1 });
    expect(r.success).toBe(false);
  });
});
