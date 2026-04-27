import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { DecisionLog, InMemoryDecisionStore } from "../../decision-log";
import {
  Config,
  ConfigAuthorityError,
  ConfigDocAlreadyExistsError,
  ConfigDocNotFoundError,
  ConfigEntryValidationError,
  ConfigLookupError,
} from "../config";
import { InMemoryConfigStore } from "../in-memory-store";
import type { DocManifest } from "../types";

const SPEC = "1.0.0-rc.1";

const LaborRateSchema = z
  .object({
    region: z.string(),
    trade: z.string(),
    wage_type: z.enum(["standard", "prevailing", "davis-bacon"]),
    effective_quarter: z.string().regex(/^[0-9]{4}-Q[1-4]$/),
    rate: z.number().min(0),
    currency: z.literal("USD"),
    unit: z.literal("per-hour"),
  })
  .strict();
type LaborRate = z.infer<typeof LaborRateSchema>;

const LABOR_MANIFEST: DocManifest = {
  id: "labor-rates",
  spec_version: SPEC,
  name: "ECC labor rates",
  description: "Per-region labor rates.",
  schema_path: "schema.json",
  current_version: 1,
  current_path: "current.json",
  dimensions: [
    { name: "region", type: "enum", values: ["aurora", "denver"] },
    {
      name: "trade",
      type: "enum",
      values: ["painter-residential", "painter-commercial"],
    },
    {
      name: "wage_type",
      type: "enum",
      values: ["standard", "prevailing", "davis-bacon"],
    },
    { name: "effective_quarter", type: "string", pattern: "^[0-9]{4}-Q[1-4]$" },
  ],
  version_history_path: "versions/",
  owner: "darrow@ecc.com",
  last_updated_at: "2026-04-15T10:24:00Z",
  last_updated_by: "darrow@ecc.com",
};

const initialRates: LaborRate[] = [
  {
    region: "aurora",
    trade: "painter-residential",
    wage_type: "standard",
    effective_quarter: "2026-Q2",
    rate: 48,
    currency: "USD",
    unit: "per-hour",
  },
  {
    region: "aurora",
    trade: "painter-residential",
    wage_type: "prevailing",
    effective_quarter: "2026-Q2",
    rate: 58,
    currency: "USD",
    unit: "per-hour",
  },
  {
    region: "denver",
    trade: "painter-commercial",
    wage_type: "standard",
    effective_quarter: "2026-Q2",
    rate: 54,
    currency: "USD",
    unit: "per-hour",
  },
];

function build() {
  const store = new InMemoryConfigStore();
  const decisionStore = new InMemoryDecisionStore();
  const decisionLog = new DecisionLog({
    pipeline_id: "pipe-1",
    agent_id: "agent-1",
    session_id: "ses-1",
    spec_version: SPEC,
    store: decisionStore,
  });
  const config = new Config({
    pipelineId: "pipe-1",
    agentId: "agent-1",
    store,
    specVersion: SPEC,
    now: () => 1_700_000_000_000,
    decisionLog,
  });
  return { config, store, decisionStore, decisionLog };
}

describe("Config.registerDoc", () => {
  test("registers + writes initial v1 + emits config_commit", async () => {
    const { config, store, decisionStore } = build();
    await config.registerDoc(
      LABOR_MANIFEST,
      LaborRateSchema,
      initialRates,
      "darrow@ecc.com",
      "initial",
    );
    expect(await config.current_version("labor-rates")).toBe(1);
    expect(await store.listVersions("labor-rates")).toEqual([1]);
    expect(await config.hasDoc("labor-rates")).toBe(true);

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const commit = r.entries.find((e) => e.type === "config_commit");
    expect(commit).toBeDefined();
    expect((commit?.metadata as { version: number }).version).toBe(1);
  });

  test("rejects registration when committed_by is not the owner", async () => {
    const { config } = build();
    await expect(
      config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "matt@ecc.com", "x"),
    ).rejects.toBeInstanceOf(ConfigAuthorityError);
  });

  test("rejects double-registration", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "x");
    await expect(
      config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "x"),
    ).rejects.toBeInstanceOf(ConfigDocAlreadyExistsError);
  });

  test("rejects initial data that fails entry-schema validation", async () => {
    const { config } = build();
    const bad = [{ ...initialRates[0], rate: "not-a-number" } as unknown as LaborRate];
    await expect(
      config.registerDoc(LABOR_MANIFEST, LaborRateSchema, bad, "darrow@ecc.com", "x"),
    ).rejects.toBeInstanceOf(ConfigEntryValidationError);
  });

  test("schema-error reports the index and field path", async () => {
    const { config } = build();
    const bad = [
      initialRates[0]!,
      { ...initialRates[1]!, rate: -5 }, // rate >= 0 violation
    ];
    let err: unknown;
    try {
      await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, bad, "darrow@ecc.com", "x");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigEntryValidationError);
    if (err instanceof ConfigEntryValidationError) {
      expect(err.issues.some((s) => s.startsWith("[1]"))).toBe(true);
      expect(err.issues.some((s) => s.includes("rate"))).toBe(true);
    }
  });
});

describe("Config.get / Config.query", () => {
  test("get returns the unique matching entry", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "x");
    const rate = await config.get<LaborRate>("labor-rates", {
      region: "aurora",
      trade: "painter-residential",
      wage_type: "standard",
      effective_quarter: "2026-Q2",
    });
    expect(rate.rate).toBe(48);
  });

  test("get with zero matches throws no_match", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "x");
    let err: unknown;
    try {
      await config.get("labor-rates", { region: "kansas-city" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigLookupError);
    if (err instanceof ConfigLookupError) {
      expect(err.reason).toBe("no_match");
      expect(err.matchCount).toBe(0);
    }
  });

  test("get with multiple matches throws multi_match", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "x");
    let err: unknown;
    try {
      // Underspecified key — many entries share region=aurora
      await config.get("labor-rates", { region: "aurora" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigLookupError);
    if (err instanceof ConfigLookupError) {
      expect(err.reason).toBe("multi_match");
      expect(err.matchCount).toBe(2);
    }
  });

  test("query returns all matching entries", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "x");
    const all = await config.query<LaborRate>("labor-rates", {
      region: "aurora",
      trade: "painter-residential",
    });
    expect(all).toHaveLength(2);
  });

  test("query on unknown doc throws ConfigDocNotFoundError", async () => {
    const { config } = build();
    await expect(config.query("ghost", {})).rejects.toBeInstanceOf(
      ConfigDocNotFoundError,
    );
  });
});

describe("Config.commit", () => {
  test("commit by owner bumps version + replaces current + emits config_commit", async () => {
    const { config, store, decisionStore } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");

    const newRates: LaborRate[] = [
      ...initialRates,
      {
        region: "denver",
        trade: "painter-residential",
        wage_type: "standard",
        effective_quarter: "2026-Q2",
        rate: 52,
        currency: "USD",
        unit: "per-hour",
      },
    ];
    const v = await config.commit({
      doc_id: "labor-rates",
      committed_by: "darrow@ecc.com",
      summary: "added Denver painter-residential",
      data: newRates,
    });

    expect(v).toBe(2);
    expect(await config.current_version("labor-rates")).toBe(2);
    expect(await store.listVersions("labor-rates")).toEqual([1, 2]);

    // Hot-swap: get reflects new entry without restart
    const denverRes = await config.get<LaborRate>("labor-rates", {
      region: "denver",
      trade: "painter-residential",
      wage_type: "standard",
      effective_quarter: "2026-Q2",
    });
    expect(denverRes.rate).toBe(52);

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const commits = r.entries.filter((e) => e.type === "config_commit");
    expect(commits).toHaveLength(2);
    const v2Commit = commits.find(
      (c) => (c.metadata as { version: number }).version === 2,
    );
    expect(v2Commit).toBeDefined();
    expect(
      (v2Commit?.metadata as { supersedes_version: number }).supersedes_version,
    ).toBe(1);
  });

  test("commit by non-owner emits permission_denied + throws ConfigAuthorityError", async () => {
    const { config, decisionStore } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");

    let err: unknown;
    try {
      await config.commit({
        doc_id: "labor-rates",
        committed_by: "matt@ecc.com",
        summary: "spoof",
        data: initialRates,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigAuthorityError);

    const r = await decisionStore.query({ pipeline_id: "pipe-1" });
    const denied = r.entries.find((e) => e.type === "permission_denied");
    expect(denied).toBeDefined();
    expect((denied?.metadata as { committer: string }).committer).toBe("matt@ecc.com");
  });

  test("commit on unknown doc throws ConfigDocNotFoundError", async () => {
    const { config } = build();
    await expect(
      config.commit({ doc_id: "ghost", committed_by: "x", summary: "x", data: [] }),
    ).rejects.toBeInstanceOf(ConfigDocNotFoundError);
  });

  test("commit with malformed entries throws ConfigEntryValidationError; current.json unchanged", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");

    const bad = [{ ...initialRates[0]!, currency: "EUR" }] as unknown as LaborRate[]; // currency is literal "USD"
    await expect(
      config.commit({
        doc_id: "labor-rates",
        committed_by: "darrow@ecc.com",
        summary: "bad",
        data: bad,
      }),
    ).rejects.toBeInstanceOf(ConfigEntryValidationError);

    // Current still v1 — no partial state
    expect(await config.current_version("labor-rates")).toBe(1);
  });

  test("immutable history: store rejects re-writing an existing version", async () => {
    const { config, store } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");
    // Try to overwrite v1 directly through the store — adapter should refuse.
    const env = await store.getVersion("labor-rates", 1);
    await expect(store.setVersion("labor-rates", env!)).rejects.toThrow(/immutable/);
  });
});

describe("Config.at_version (time-travel)", () => {
  test("returns the entry as it was in a past version", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");
    // v2 changes the aurora-residential-standard rate
    const v2: LaborRate[] = initialRates.map((r) =>
      r.region === "aurora" && r.wage_type === "standard"
        ? { ...r, rate: 50 }
        : r,
    );
    await config.commit({
      doc_id: "labor-rates",
      committed_by: "darrow@ecc.com",
      summary: "Q2 rate bump",
      data: v2,
    });

    const handle = config.at_version("labor-rates", 1);
    const old = await handle.get<LaborRate>({
      region: "aurora",
      trade: "painter-residential",
      wage_type: "standard",
      effective_quarter: "2026-Q2",
    });
    expect(old.rate).toBe(48);

    // current still reflects v2
    const current = await config.get<LaborRate>("labor-rates", {
      region: "aurora",
      trade: "painter-residential",
      wage_type: "standard",
      effective_quarter: "2026-Q2",
    });
    expect(current.rate).toBe(50);
  });

  test("at_version with unknown version throws ConfigDocNotFoundError on read", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");
    const handle = config.at_version("labor-rates", 99);
    await expect(handle.query({})).rejects.toBeInstanceOf(ConfigDocNotFoundError);
  });

  test("at_version handle's get respects no_match and multi_match", async () => {
    const { config } = build();
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");
    const handle = config.at_version("labor-rates", 1);
    await expect(handle.get({ region: "aurora" })).rejects.toBeInstanceOf(
      ConfigLookupError,
    );
  });
});

describe("Config — works without decisionLog", () => {
  test("commit succeeds with no decisionLog wired", async () => {
    const store = new InMemoryConfigStore();
    const config = new Config({
      pipelineId: "pipe-1",
      agentId: "agent-1",
      store,
      specVersion: SPEC,
    });
    await config.registerDoc(LABOR_MANIFEST, LaborRateSchema, initialRates, "darrow@ecc.com", "v1");
    expect(await config.current_version("labor-rates")).toBe(1);
  });
});
