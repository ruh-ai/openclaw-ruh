/**
 * workspace-writer.test.ts
 * Tests for readWorkspaceFile, writeWorkspaceFile, writeWorkspaceFiles,
 * and mergeWorkspaceCopilotToMain. All HTTP calls via fetchBackendWithAuth are mocked.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mock fetchBackendWithAuth ────────────────────────────────────────────────

const mockFetchBackendWithAuth = mock(async () =>
  new Response(JSON.stringify({ content: "hello" }), { status: 200 }),
);

mock.module("@/lib/auth/backend-fetch", () => ({
  fetchBackendWithAuth: mockFetchBackendWithAuth,
}));

// ─── readWorkspaceFile ────────────────────────────────────────────────────────

describe("readWorkspaceFile", () => {
  beforeEach(() => {
    mockFetchBackendWithAuth.mockReset();
  });

  test("returns content from copilot workspace on success", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: "SOUL content here" }), { status: 200 }),
    );

    const { readWorkspaceFile } = await import("./workspace-writer");
    const result = await readWorkspaceFile("sandbox-1", "SOUL.md");
    expect(result).toBe("SOUL content here");
    expect(mockFetchBackendWithAuth).toHaveBeenCalledTimes(1);
    const url = mockFetchBackendWithAuth.mock.calls[0][0] as string;
    expect(url).toContain("workspace-copilot");
    expect(url).toContain("SOUL.md");
  });

  test("falls back to main workspace when copilot returns non-ok", async () => {
    // copilot fails
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );
    // main workspace succeeds
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: "main content" }), { status: 200 }),
    );

    const { readWorkspaceFile } = await import("./workspace-writer");
    const result = await readWorkspaceFile("sandbox-1", "skills/search.ts");
    expect(result).toBe("main content");
    expect(mockFetchBackendWithAuth).toHaveBeenCalledTimes(2);
    const fallbackUrl = mockFetchBackendWithAuth.mock.calls[1][0] as string;
    expect(fallbackUrl).toContain("/workspace/file");
  });

  test("returns null when both workspaces fail", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("not found", { status: 404 }),
    );
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("server error", { status: 500 }),
    );

    const { readWorkspaceFile } = await import("./workspace-writer");
    const result = await readWorkspaceFile("sandbox-1", "missing.md");
    expect(result).toBeNull();
  });

  test("returns null when JSON response has no content field", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ other: "data" }), { status: 200 }),
    );
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ also: "wrong" }), { status: 200 }),
    );

    const { readWorkspaceFile } = await import("./workspace-writer");
    const result = await readWorkspaceFile("sandbox-1", "file.md");
    expect(result).toBeNull();
  });

  test("URL-encodes the path parameter", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: "ok" }), { status: 200 }),
    );

    const { readWorkspaceFile } = await import("./workspace-writer");
    await readWorkspaceFile("sandbox-1", ".openclaw/plan/PLAN.md");
    const url = mockFetchBackendWithAuth.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent(".openclaw/plan/PLAN.md"));
  });
});

// ─── writeWorkspaceFile ────────────────────────────────────────────────────────

describe("writeWorkspaceFile", () => {
  beforeEach(() => {
    mockFetchBackendWithAuth.mockReset();
  });

  test("returns ok result on success", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ path: "SOUL.md", ok: true }), { status: 200 }),
    );

    const { writeWorkspaceFile } = await import("./workspace-writer");
    const result = await writeWorkspaceFile("sandbox-1", "SOUL.md", "# Soul");
    expect(result.ok).toBe(true);
    expect(result.path).toBe("SOUL.md");
  });

  test("returns error result on HTTP failure", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("Forbidden", { status: 403 }),
    );

    const { writeWorkspaceFile } = await import("./workspace-writer");
    const result = await writeWorkspaceFile("sandbox-1", "secret.md", "data");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 403");
  });

  test("sends correct POST body with path and content", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ path: "skills/foo.ts", ok: true }), { status: 200 }),
    );

    const { writeWorkspaceFile } = await import("./workspace-writer");
    await writeWorkspaceFile("sandbox-1", "skills/foo.ts", "export function foo() {}");

    const callArgs = mockFetchBackendWithAuth.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.path).toBe("skills/foo.ts");
    expect(body.content).toBe("export function foo() {}");
  });
});

// ─── writeWorkspaceFiles ──────────────────────────────────────────────────────

describe("writeWorkspaceFiles", () => {
  beforeEach(() => {
    mockFetchBackendWithAuth.mockReset();
  });

  test("returns ok batch result on success", async () => {
    const batchResult = {
      ok: true,
      results: [{ path: "a.ts", ok: true }, { path: "b.ts", ok: true }],
      failed: 0,
      succeeded: 2,
    };
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify(batchResult), { status: 200 }),
    );

    const { writeWorkspaceFiles } = await import("./workspace-writer");
    const result = await writeWorkspaceFiles("sandbox-1", [
      { path: "a.ts", content: "a" },
      { path: "b.ts", content: "b" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  test("returns failed batch result on HTTP error", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    const { writeWorkspaceFiles } = await import("./workspace-writer");
    const files = [
      { path: "a.ts", content: "a" },
      { path: "b.ts", content: "b" },
    ];
    const result = await writeWorkspaceFiles("sandbox-1", files);
    expect(result.ok).toBe(false);
    expect(result.failed).toBe(2);
    expect(result.succeeded).toBe(0);
    for (const r of result.results) {
      expect(r.ok).toBe(false);
      expect(r.error).toContain("HTTP 500");
    }
  });

  test("sends files array in POST body", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, results: [], failed: 0, succeeded: 0 }), { status: 200 }),
    );

    const { writeWorkspaceFiles } = await import("./workspace-writer");
    const files = [{ path: "x.ts", content: "x" }];
    await writeWorkspaceFiles("sandbox-1", files);

    const callArgs = mockFetchBackendWithAuth.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.files).toEqual(files);
  });
});

// ─── mergeWorkspaceCopilotToMain ──────────────────────────────────────────────

describe("mergeWorkspaceCopilotToMain", () => {
  beforeEach(() => {
    mockFetchBackendWithAuth.mockReset();
  });

  test("returns true on successful merge", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );

    const { mergeWorkspaceCopilotToMain } = await import("./workspace-writer");
    const result = await mergeWorkspaceCopilotToMain("sandbox-1");
    expect(result).toBe(true);
  });

  test("returns false on HTTP error", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );

    const { mergeWorkspaceCopilotToMain } = await import("./workspace-writer");
    const result = await mergeWorkspaceCopilotToMain("sandbox-1");
    expect(result).toBe(false);
  });

  test("POSTs to merge-copilot endpoint", async () => {
    mockFetchBackendWithAuth.mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );

    const { mergeWorkspaceCopilotToMain } = await import("./workspace-writer");
    await mergeWorkspaceCopilotToMain("sandbox-42");

    const url = mockFetchBackendWithAuth.mock.calls[0][0] as string;
    const options = mockFetchBackendWithAuth.mock.calls[0][1] as RequestInit;
    expect(url).toContain("sandbox-42");
    expect(url).toContain("merge-copilot");
    expect(options.method).toBe("POST");
  });
});
