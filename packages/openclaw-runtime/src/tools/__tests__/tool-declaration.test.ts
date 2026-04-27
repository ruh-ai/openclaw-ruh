import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseToolDeclaration, crossCheckDeclaration } from "../tool-declaration";
import { BaseTool } from "../tool-interface";
import type { ToolContext, ToolResult } from "../tool-interface";

class MyTool extends BaseTool<unknown, unknown> {
  readonly name = "my-tool";
  readonly description = "A tool.";
  readonly version = "0.1.0";
  readonly specVersion = "1.0.0-rc.1";
  readonly inputSchema = z.object({});

  async call(_input: unknown, _ctx: ToolContext): Promise<ToolResult<unknown>> {
    return { success: true, output: {} };
  }

  override isReadOnly() {
    return true;
  }
  override isConcurrencySafe() {
    return true;
  }
}

const validDeclaration = {
  id: "my-tool",
  spec_version: "1.0.0-rc.1",
  name: "My Tool",
  description: "A tool.",
  tool_kind: "research",
  permissions: {
    read_only: true,
    destructive: false,
    concurrency_safe: true,
  },
};

describe("parseToolDeclaration", () => {
  test("accepts a valid declaration", () => {
    const result = parseToolDeclaration(validDeclaration);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.declaration.id).toBe("my-tool");
      expect(result.declaration.permissions.read_only).toBe(true);
    }
  });

  test("rejects read_only:true + destructive:true (mutually exclusive)", () => {
    const bad = {
      ...validDeclaration,
      permissions: { read_only: true, destructive: true, concurrency_safe: true },
    };
    const result = parseToolDeclaration(bad);
    expect(result.ok).toBe(false);
  });

  test("rejects non-kebab-case id", () => {
    const bad = { ...validDeclaration, id: "MyTool" };
    const result = parseToolDeclaration(bad);
    expect(result.ok).toBe(false);
  });

  test("rejects unknown spec_version pattern", () => {
    const bad = { ...validDeclaration, spec_version: "not-a-version" };
    const result = parseToolDeclaration(bad);
    expect(result.ok).toBe(false);
  });

  test("accepts a built-in tool_kind", () => {
    const ok = { ...validDeclaration, tool_kind: "workspace-write" };
    const result = parseToolDeclaration(ok);
    expect(result.ok).toBe(true);
  });

  test("accepts a custom kebab-case tool_kind", () => {
    const ok = { ...validDeclaration, tool_kind: "ecc-pricing-lookup" };
    const result = parseToolDeclaration(ok);
    expect(result.ok).toBe(true);
  });

  test("rejects empty description", () => {
    const bad = { ...validDeclaration, description: "" };
    const result = parseToolDeclaration(bad);
    expect(result.ok).toBe(false);
  });
});

describe("crossCheckDeclaration", () => {
  test("returns no mismatches when declaration matches runtime", () => {
    const tool = new MyTool();
    const parsed = parseToolDeclaration(validDeclaration);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const mismatches = crossCheckDeclaration(parsed.declaration, tool);
    expect(mismatches).toHaveLength(0);
  });

  test("flags read_only mismatch", () => {
    class LyingTool extends MyTool {
      override isReadOnly() {
        return false;
      } // declaration says read_only:true; this lies
    }

    const parsed = parseToolDeclaration(validDeclaration);
    if (!parsed.ok) throw new Error("declaration should parse");
    const mismatches = crossCheckDeclaration(parsed.declaration, new LyingTool());

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.field).toBe("read_only");
  });

  test("flags destructive mismatch", () => {
    class LyingTool extends MyTool {
      override isReadOnly() {
        return false;
      }
      override isDestructive() {
        return true;
      } // declaration says destructive:false
    }

    const parsed = parseToolDeclaration(validDeclaration);
    if (!parsed.ok) throw new Error("declaration should parse");
    const mismatches = crossCheckDeclaration(parsed.declaration, new LyingTool());

    expect(mismatches.some((m) => m.field === "destructive")).toBe(true);
  });

  test("flags concurrency_safe mismatch", () => {
    class LyingTool extends MyTool {
      override isConcurrencySafe() {
        return false;
      }
    }

    const parsed = parseToolDeclaration(validDeclaration);
    if (!parsed.ok) throw new Error("declaration should parse");
    const mismatches = crossCheckDeclaration(parsed.declaration, new LyingTool());

    expect(mismatches.some((m) => m.field === "concurrency_safe")).toBe(true);
  });

  test("flags runtime stages broader than declared", () => {
    class StagedTool extends MyTool {
      override readonly availableStages = ["drafted", "validated", "tested"] as const;
    }

    const declaration = {
      ...validDeclaration,
      permissions: {
        ...validDeclaration.permissions,
        stages: ["drafted", "validated"], // tool runtime adds 'tested' beyond declaration
      },
    };
    const parsed = parseToolDeclaration(declaration);
    if (!parsed.ok) throw new Error("declaration should parse");
    const mismatches = crossCheckDeclaration(parsed.declaration, new StagedTool());

    expect(mismatches.some((m) => m.field === "available_stages")).toBe(true);
  });
});
