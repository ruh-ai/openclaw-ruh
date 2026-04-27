import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REDACTION_RULES,
  customRule,
  redactObject,
  redactString,
} from "../redaction";

describe("redactString — default rules", () => {
  test("Stripe live key", () => {
    const out = redactString("token=sk_live_abc123def456ghi789");
    expect(out).not.toContain("sk_live_abc123def456ghi789");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("Stripe test key", () => {
    const out = redactString("sk_test_abc123def456ghi789xyz");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("OpenAI / Anthropic-style key (sk-...)", () => {
    const out = redactString("api key sk-abcdef0123456789ABCDEF and more");
    expect(out).not.toContain("sk-abcdef0123456789ABCDEF");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("Bearer token preserves prefix and redacts body", () => {
    const out = redactString("Authorization: Bearer abcdefghij1234567890");
    expect(out).toContain("Bearer <REDACTED:credential>");
    expect(out).not.toContain("abcdefghij1234567890");
  });

  test("Slack token", () => {
    expect(redactString("xoxb-12345-abcdef-token-here")).toContain(
      "<REDACTED:credential>",
    );
    expect(redactString("xoxp-secret-pad-token")).toContain(
      "<REDACTED:credential>",
    );
  });

  test("GitHub PAT", () => {
    const pat = "ghp_" + "A".repeat(36);
    const out = redactString(`token=${pat}`);
    expect(out).not.toContain(pat);
    expect(out).toContain("<REDACTED:credential>");
  });

  test("AWS access key id", () => {
    const out = redactString("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE rest");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("Generic token= prefix", () => {
    const out = redactString("connect token=longopaquesecretvalue123 then go");
    expect(out).not.toContain("longopaquesecretvalue123");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("Generic apiKey= prefix", () => {
    const out = redactString('apiKey="opaquekeythirtycharsxx"');
    expect(out).not.toContain("opaquekeythirtycharsxx");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("macOS home directory path", () => {
    const out = redactString("file at /Users/alice/Documents/x.md");
    expect(out).toContain("<REDACTED:home>");
    expect(out).not.toContain("/Users/alice");
    // Trailing path component preserved
    expect(out).toContain("/Documents/x.md");
  });

  test("Linux home directory path", () => {
    const out = redactString("error in /home/bob/.cache/x");
    expect(out).toContain("<REDACTED:home>");
    expect(out).not.toContain("/home/bob");
  });

  test("multiple credentials in one string are all redacted (g flag)", () => {
    const a = "ghp_" + "X".repeat(36);
    const b = "ghp_" + "Y".repeat(36);
    const out = redactString(`first=${a} second=${b}`);
    expect(out).not.toContain(a);
    expect(out).not.toContain(b);
    // Two replacements
    expect(out.match(/<REDACTED:credential>/g)).toHaveLength(2);
  });

  test("emails are NOT redacted by default", () => {
    const out = redactString("contact prasanjit@ruh.ai today");
    expect(out).toContain("prasanjit@ruh.ai");
  });

  test("plain text without sensitive patterns is unchanged", () => {
    expect(redactString("hello world, nothing sensitive here")).toBe(
      "hello world, nothing sensitive here",
    );
  });
});

describe("redactString — custom rules", () => {
  test("extraRules apply on top of defaults", () => {
    const extra = [customRule(/SECRET-\w+/, "<REDACTED:custom>", "test")];
    const out = redactString("emit SECRET-XYZ token", { extraRules: extra });
    expect(out).toContain("<REDACTED:custom>");
    expect(out).not.toContain("SECRET-XYZ");
  });

  test("default rules still fire when extraRules supplied", () => {
    const extra = [customRule(/CUSTOM-\w+/, "<REDACTED:custom>", "test")];
    const out = redactString(
      "Bearer abcdefghij1234567890 plus CUSTOM-VAL",
      { extraRules: extra },
    );
    expect(out).toContain("Bearer <REDACTED:credential>");
    expect(out).toContain("<REDACTED:custom>");
  });
});

describe("customRule helper", () => {
  test("forces global flag when missing", () => {
    const r = customRule(/abc/, "[X]", "test");
    expect(r.pattern.flags).toContain("g");
    // Both occurrences replaced
    expect("abc abc".replace(r.pattern, r.replacement)).toBe("[X] [X]");
  });

  test("preserves existing flags and adds g if missing", () => {
    const r = customRule(/abc/i, "[X]", "test");
    expect(r.pattern.flags).toContain("g");
    expect(r.pattern.flags).toContain("i");
  });

  test("does not double-add g flag", () => {
    const r = customRule(/abc/g, "[X]", "test");
    // exactly one 'g'
    expect(r.pattern.flags.split("").filter((f) => f === "g")).toHaveLength(1);
  });
});

describe("redactObject — recursion", () => {
  test("redacts strings inside nested objects", () => {
    const input = {
      level1: {
        level2: {
          token: "sk_live_abc123def456ghi789",
        },
      },
    };
    const out = redactObject(input);
    expect(out.level1.level2.token).toContain("<REDACTED:credential>");
  });

  test("redacts strings inside arrays", () => {
    const input = {
      lines: [
        "ok",
        "Bearer abcdefghij1234567890",
        { nested: "ghp_" + "Z".repeat(36) },
      ],
    };
    const out = redactObject(input);
    expect(out.lines[0]).toBe("ok");
    expect(out.lines[1]).toContain("Bearer <REDACTED:credential>");
    expect((out.lines[2] as { nested: string }).nested).toContain(
      "<REDACTED:credential>",
    );
  });

  test("non-string primitives pass through unchanged", () => {
    const input = { count: 42, ok: true, none: null, missing: undefined };
    const out = redactObject(input);
    expect(out.count).toBe(42);
    expect(out.ok).toBe(true);
    expect(out.none).toBeNull();
    expect(out.missing).toBeUndefined();
  });

  test("object keys are NOT redacted", () => {
    // keys are field names — redacting them would corrupt structure
    const input: Record<string, string> = {};
    input["sk-abcdef0123456789ABCDEF"] = "value";
    const out = redactObject(input);
    expect(Object.keys(out)).toContain("sk-abcdef0123456789ABCDEF");
  });

  test("scalar string at root", () => {
    const out = redactObject("sk_live_abc123def456ghi789");
    expect(out).toContain("<REDACTED:credential>");
  });

  test("does not mutate input", () => {
    const input = { token: "sk_live_abc123def456ghi789" };
    const before = JSON.stringify(input);
    redactObject(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("DEFAULT_REDACTION_RULES — sanity", () => {
  test("every default rule has the g flag", () => {
    for (const rule of DEFAULT_REDACTION_RULES) {
      expect(rule.pattern.flags).toContain("g");
    }
  });

  test("every default rule has a non-empty description", () => {
    for (const rule of DEFAULT_REDACTION_RULES) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});
