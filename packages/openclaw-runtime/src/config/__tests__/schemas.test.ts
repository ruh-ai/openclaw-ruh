import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  DimensionSchema,
  DocIndexEntrySchema,
  DocManifestSchema,
  ImportJobSchema,
  TopLevelManifestSchema,
  VersionEnvelopeLooseSchema,
  versionEnvelopeSchema,
} from "../schemas";

const validDocManifest = {
  id: "labor-rates",
  spec_version: "1.0.0-rc.1",
  name: "ECC labor rates",
  description: "Per-region labor rates.",
  schema_path: "schema.json" as const,
  current_version: 17,
  current_path: "current.json" as const,
  dimensions: [
    { name: "region", type: "enum" as const, values: ["aurora", "denver"] },
    { name: "trade", type: "string" as const, pattern: "^[a-z][a-z0-9-]*$" },
  ],
  lookup_function: "rate_by(region, trade)",
  version_history_path: "versions/" as const,
  owner: "darrow@ecc.com",
  last_updated_at: "2026-04-15T10:24:00Z",
  last_updated_by: "darrow@ecc.com",
};

describe("DocIndexEntrySchema", () => {
  test("accepts a valid entry", () => {
    const r = DocIndexEntrySchema.safeParse({
      id: "labor-rates",
      path: "labor-rates/",
      owner: "darrow@ecc.com",
      review_lane: "estimating",
    });
    expect(r.success).toBe(true);
  });

  test("rejects path without trailing slash", () => {
    const r = DocIndexEntrySchema.safeParse({
      id: "labor-rates",
      path: "labor-rates",
      owner: "darrow@ecc.com",
      review_lane: "estimating",
    });
    expect(r.success).toBe(false);
  });

  test("rejects non-kebab id", () => {
    const r = DocIndexEntrySchema.safeParse({
      id: "Labor_Rates",
      path: "labor-rates/",
      owner: "darrow@ecc.com",
      review_lane: "estimating",
    });
    expect(r.success).toBe(false);
  });

  test("rejects extra fields", () => {
    const r = DocIndexEntrySchema.safeParse({
      id: "x",
      path: "x/",
      owner: "x",
      review_lane: "estimating",
      extra: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("TopLevelManifestSchema", () => {
  test("valid manifest with two docs", () => {
    const r = TopLevelManifestSchema.safeParse({
      spec_version: "1.0.0",
      docs: [
        { id: "a", path: "a/", owner: "x", review_lane: "estimating" },
        { id: "b", path: "b/", owner: "y", review_lane: "operations" },
      ],
    });
    expect(r.success).toBe(true);
  });

  test("rejects bad spec_version pattern", () => {
    const r = TopLevelManifestSchema.safeParse({
      spec_version: "v1",
      docs: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("DimensionSchema", () => {
  test("type=enum requires non-empty values", () => {
    const r = DimensionSchema.safeParse({ name: "x", type: "enum" });
    expect(r.success).toBe(false);
  });

  test("type=enum with values passes", () => {
    const r = DimensionSchema.safeParse({
      name: "x",
      type: "enum",
      values: ["a", "b"],
    });
    expect(r.success).toBe(true);
  });

  test("type=string with pattern passes", () => {
    const r = DimensionSchema.safeParse({
      name: "x",
      type: "string",
      pattern: "^[a-z]+$",
    });
    expect(r.success).toBe(true);
  });

  test("rejects non-snake_case name", () => {
    const r = DimensionSchema.safeParse({ name: "Region", type: "string" });
    expect(r.success).toBe(false);
  });

  test("type=integer accepted without values/pattern", () => {
    expect(DimensionSchema.safeParse({ name: "x", type: "integer" }).success).toBe(true);
  });
});

describe("DocManifestSchema", () => {
  test("valid manifest passes", () => {
    expect(DocManifestSchema.safeParse(validDocManifest).success).toBe(true);
  });

  test("rejects schema_path other than schema.json", () => {
    const r = DocManifestSchema.safeParse({
      ...validDocManifest,
      schema_path: "schema.yaml",
    });
    expect(r.success).toBe(false);
  });

  test("rejects current_path other than current.json", () => {
    const r = DocManifestSchema.safeParse({
      ...validDocManifest,
      current_path: "live.json",
    });
    expect(r.success).toBe(false);
  });

  test("rejects current_version < 1", () => {
    const r = DocManifestSchema.safeParse({
      ...validDocManifest,
      current_version: 0,
    });
    expect(r.success).toBe(false);
  });

  test("rejects empty dimensions array", () => {
    const r = DocManifestSchema.safeParse({
      ...validDocManifest,
      dimensions: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("versionEnvelopeSchema (typed) + VersionEnvelopeLooseSchema", () => {
  const entrySchema = z.object({ rate: z.number(), region: z.string() }).strict();

  test("typed envelope validates each data entry", () => {
    const schema = versionEnvelopeSchema(entrySchema);
    const r = schema.safeParse({
      version: 1,
      spec_version: "1.0.0",
      committed_at: "2026-04-15T10:24:00Z",
      committed_by: "x",
      summary: "first",
      supersedes_version: null,
      data: [{ rate: 48, region: "aurora" }],
    });
    expect(r.success).toBe(true);
  });

  test("typed envelope rejects bad entry", () => {
    const schema = versionEnvelopeSchema(entrySchema);
    const r = schema.safeParse({
      version: 1,
      spec_version: "1.0.0",
      committed_at: "2026-04-15T10:24:00Z",
      committed_by: "x",
      summary: "x",
      supersedes_version: null,
      data: [{ rate: "not-a-number", region: "aurora" }],
    });
    expect(r.success).toBe(false);
  });

  test("loose envelope accepts unknown entry shape", () => {
    const r = VersionEnvelopeLooseSchema.safeParse({
      version: 1,
      spec_version: "1.0.0",
      committed_at: "2026-04-15T10:24:00Z",
      committed_by: "x",
      summary: "x",
      supersedes_version: null,
      data: [{ anything: "here" }],
    });
    expect(r.success).toBe(true);
  });

  test("envelope rejects supersedes_version=0 (must be >=1 or null)", () => {
    const r = VersionEnvelopeLooseSchema.safeParse({
      version: 2,
      spec_version: "1.0.0",
      committed_at: "2026-04-15T10:24:00Z",
      committed_by: "x",
      summary: "x",
      supersedes_version: 0,
      data: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("ImportJobSchema", () => {
  test("URL source accepted", () => {
    const r = ImportJobSchema.safeParse({
      doc_id: "tax",
      schedule: "0 3 * * *",
      source: "https://api.taxjar.com/v2/rates",
    });
    expect(r.success).toBe(true);
  });

  test("named connector source accepted", () => {
    const r = ImportJobSchema.safeParse({
      doc_id: "tax",
      schedule: "0 3 * * *",
      source: "connector://taxjar",
    });
    expect(r.success).toBe(true);
  });

  test("non-kebab doc_id rejected", () => {
    const r = ImportJobSchema.safeParse({
      doc_id: "Tax",
      schedule: "x",
      source: "x",
    });
    expect(r.success).toBe(false);
  });
});
