import { describe, expect, test } from "bun:test";
import { InMemoryConfigStore } from "../in-memory-store";
import type { DocManifest, VersionEnvelope } from "../types";

const baseManifest: DocManifest = {
  id: "labor-rates",
  spec_version: "1.0.0",
  name: "ECC labor rates",
  description: "x",
  schema_path: "schema.json",
  current_version: 1,
  current_path: "current.json",
  dimensions: [{ name: "region", type: "enum", values: ["aurora"] }],
  version_history_path: "versions/",
  owner: "darrow@ecc.com",
  last_updated_at: "2026-04-15T10:24:00Z",
  last_updated_by: "darrow@ecc.com",
};

describe("InMemoryConfigStore — manifest + listDocs", () => {
  test("hasDoc returns false until any setter has run", async () => {
    const s = new InMemoryConfigStore();
    expect(await s.hasDoc("labor-rates")).toBe(false);
  });

  test("setDocManifest registers the doc; hasDoc + getDocManifest reflect it", async () => {
    const s = new InMemoryConfigStore();
    await s.setDocManifest("labor-rates", baseManifest);
    expect(await s.hasDoc("labor-rates")).toBe(true);
    expect(await s.getDocManifest("labor-rates")).toEqual(baseManifest);
  });

  test("listDocs returns all registered ids", async () => {
    const s = new InMemoryConfigStore();
    await s.setDocManifest("a", { ...baseManifest, id: "a" });
    await s.setDocManifest("b", { ...baseManifest, id: "b" });
    expect((await s.listDocs()).slice().sort()).toEqual(["a", "b"]);
  });

  test("getDocManifest returns undefined for unknown doc", async () => {
    const s = new InMemoryConfigStore();
    expect(await s.getDocManifest("nope")).toBeUndefined();
  });
});

describe("InMemoryConfigStore — current.json roundtrip", () => {
  test("setCurrent then getCurrent returns the same array", async () => {
    const s = new InMemoryConfigStore();
    const data = [{ region: "aurora", rate: 48 }];
    await s.setCurrent("labor-rates", data);
    expect(await s.getCurrent("labor-rates")).toEqual(data);
  });

  test("getCurrent returns undefined for unset doc", async () => {
    const s = new InMemoryConfigStore();
    expect(await s.getCurrent("nope")).toBeUndefined();
  });
});

describe("InMemoryConfigStore — versions are immutable", () => {
  function envelope(version: number): VersionEnvelope<{ region: string }> {
    return {
      version,
      spec_version: "1.0.0",
      committed_at: "2026-04-15T10:24:00Z",
      committed_by: "darrow@ecc.com",
      summary: "x",
      supersedes_version: version === 1 ? null : version - 1,
      data: [{ region: "aurora" }],
    };
  }

  test("setVersion + getVersion roundtrip", async () => {
    const s = new InMemoryConfigStore();
    await s.setVersion("labor-rates", envelope(1));
    expect((await s.getVersion("labor-rates", 1))?.version).toBe(1);
  });

  test("setVersion twice for the same version throws", async () => {
    const s = new InMemoryConfigStore();
    await s.setVersion("labor-rates", envelope(1));
    await expect(s.setVersion("labor-rates", envelope(1))).rejects.toThrow(/immutable/);
  });

  test("listVersions returns all stored numbers ascending", async () => {
    const s = new InMemoryConfigStore();
    await s.setVersion("labor-rates", envelope(2));
    await s.setVersion("labor-rates", envelope(1));
    await s.setVersion("labor-rates", envelope(3));
    expect(await s.listVersions("labor-rates")).toEqual([1, 2, 3]);
  });

  test("listVersions on unknown doc returns empty array", async () => {
    const s = new InMemoryConfigStore();
    expect(await s.listVersions("nope")).toEqual([]);
  });
});
