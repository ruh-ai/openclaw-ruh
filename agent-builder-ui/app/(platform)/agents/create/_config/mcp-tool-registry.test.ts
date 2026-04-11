import { describe, expect, test, mock, beforeEach } from "bun:test";

const fetchMock = mock(async (_url: string, _init?: RequestInit) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: fetchMock,
}));

import {
  areRequiredCredentialsFilled,
  getToolCredentialFields,
  getToolRuntimeInputGuidance,
  getToolDefinition,
  toolSupportsDirectConnection,
  toolRequiresCredentials,
  listSupportedTools,
  buildSupportedToolsContext,
  saveToolCredentials,
  deleteToolCredentials,
  fetchCredentialSummary,
  MCP_TOOL_REGISTRY,
} from "./mcp-tool-registry";

describe("mcp-tool-registry", () => {
  test("keeps Google Ads customer id out of encrypted credential fields", () => {
    expect(getToolCredentialFields("google-ads").map((field) => field.key)).toEqual([
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
    ]);
  });

  test("treats the Google Ads connector as complete when only the secret-bearing fields are present", () => {
    expect(
      areRequiredCredentialsFilled("google-ads", {
        GOOGLE_ADS_CLIENT_ID: "client-id",
        GOOGLE_ADS_CLIENT_SECRET: "client-secret",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
        GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      }),
    ).toBe(true);

    expect(
      areRequiredCredentialsFilled("google-ads", {
        GOOGLE_ADS_CLIENT_ID: "client-id",
        GOOGLE_ADS_CLIENT_SECRET: "client-secret",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
      }),
    ).toBe(false);
  });

  test("points Google Ads operators to Runtime Inputs for the non-secret customer id", () => {
    expect(getToolRuntimeInputGuidance("google-ads")).toEqual({
      title: "Runtime input required separately",
      description:
        "Enter GOOGLE_ADS_CUSTOMER_ID in Runtime Inputs. Keep it operator-visible instead of storing it as an encrypted credential.",
    });
  });
});

// ─── getToolDefinition ────────────────────────────────────────────────────────

describe("getToolDefinition", () => {
  test("returns definition for known tool", () => {
    const def = getToolDefinition("github");
    expect(def).not.toBeNull();
    expect(def?.id).toBe("github");
    expect(def?.name).toBe("GitHub");
  });

  test("returns null for unknown tool", () => {
    expect(getToolDefinition("unknown-tool-xyz")).toBeNull();
  });

  test("google-ads definition has oauth authKind", () => {
    const def = getToolDefinition("google-ads");
    expect(def?.authKind).toBe("oauth");
    expect((def?.credentials.length ?? 0)).toBeGreaterThan(0);
  });
});

// ─── toolSupportsDirectConnection ────────────────────────────────────────────

describe("toolSupportsDirectConnection", () => {
  test("returns true for known tools in registry", () => {
    expect(toolSupportsDirectConnection("github")).toBe(true);
    expect(toolSupportsDirectConnection("slack")).toBe(true);
  });

  test("returns false for unknown tools", () => {
    expect(toolSupportsDirectConnection("zapier")).toBe(false);
  });
});

// ─── toolRequiresCredentials ──────────────────────────────────────────────────

describe("toolRequiresCredentials", () => {
  test("returns true for tools with non-empty credentials array", () => {
    expect(toolRequiresCredentials("github")).toBe(true);
  });

  test("returns false for unknown tools (no credentials array)", () => {
    expect(toolRequiresCredentials("nonexistent")).toBe(false);
  });
});

// ─── listSupportedTools ───────────────────────────────────────────────────────

describe("listSupportedTools", () => {
  test("returns one entry per registry tool", () => {
    const tools = listSupportedTools();
    const registryKeys = Object.keys(MCP_TOOL_REGISTRY);
    expect(tools.length).toBe(registryKeys.length);
  });

  test("each entry has toolId, name, connectorType=mcp, and mcpPackage", () => {
    for (const tool of listSupportedTools()) {
      expect(tool.toolId).toBeDefined();
      expect(tool.name).toBeDefined();
      expect(tool.connectorType).toBe("mcp");
      expect(tool.mcpPackage).toBeDefined();
    }
  });
});

// ─── buildSupportedToolsContext ───────────────────────────────────────────────

describe("buildSupportedToolsContext", () => {
  test("returns a string mentioning all registry tool ids", () => {
    const ctx = buildSupportedToolsContext();
    expect(typeof ctx).toBe("string");
    for (const toolId of Object.keys(MCP_TOOL_REGISTRY)) {
      expect(ctx).toContain(toolId);
    }
  });

  test("contains MCP connector type in output", () => {
    expect(buildSupportedToolsContext()).toContain("MCP");
  });
});

// ─── saveToolCredentials ──────────────────────────────────────────────────────

describe("saveToolCredentials", () => {
  beforeEach(() => fetchMock.mockClear());

  test("returns ok:true on successful PUT", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ saved: true }), { status: 200 }),
    );
    const result = await saveToolCredentials("a1", "github", { GITHUB_PERSONAL_ACCESS_TOKEN: "tok" });
    expect(result.ok).toBe(true);
  });

  test("returns ok:false with error from body on non-ok response", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const result = await saveToolCredentials("a1", "github", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unauthorized");
  });

  test("returns ok:false with status fallback when body has no error key", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ message: "Oops" }), { status: 500 }),
    );
    const result = await saveToolCredentials("a1", "github", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  test("returns ok:false with network error message when fetch throws", async () => {
    fetchMock.mockImplementation(async () => { throw new Error("Network failure"); });
    const result = await saveToolCredentials("a1", "github", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network failure");
  });
});

// ─── deleteToolCredentials ────────────────────────────────────────────────────

describe("deleteToolCredentials", () => {
  beforeEach(() => fetchMock.mockClear());

  test("returns ok:true on success", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 200 }));
    expect((await deleteToolCredentials("a1", "github")).ok).toBe(true);
  });

  test("returns ok:false when response is not ok", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    expect((await deleteToolCredentials("a1", "github")).ok).toBe(false);
  });

  test("returns ok:false when fetch throws", async () => {
    fetchMock.mockImplementation(async () => { throw new Error("refused"); });
    expect((await deleteToolCredentials("a1", "github")).ok).toBe(false);
  });
});

// ─── fetchCredentialSummary ───────────────────────────────────────────────────

describe("fetchCredentialSummary", () => {
  beforeEach(() => fetchMock.mockClear());

  test("returns parsed array on success", async () => {
    const data = [{ toolId: "github", hasCredentials: true, createdAt: "2026-01-01T00:00:00Z" }];
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(data), { status: 200 }));
    const result = await fetchCredentialSummary("a1");
    expect(result).toHaveLength(1);
    expect(result[0].toolId).toBe("github");
  });

  test("returns empty array when response is not ok", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 403 }));
    expect(await fetchCredentialSummary("a1")).toEqual([]);
  });

  test("returns empty array when fetch throws", async () => {
    fetchMock.mockImplementation(async () => { throw new Error("err"); });
    expect(await fetchCredentialSummary("a1")).toEqual([]);
  });
});
