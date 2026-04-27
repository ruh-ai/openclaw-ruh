import { describe, expect, test, mock } from "bun:test";
import {
  DEFAULT_RETRY_CONFIGS,
  getRetryConfig,
  computeDelay,
  shouldRetry,
  withRetry,
} from "../retry-strategy";

describe("DEFAULT_RETRY_CONFIGS", () => {
  test("matches spec 014 — rate_limit gets 4 attempts, exponential ×2", () => {
    expect(DEFAULT_RETRY_CONFIGS.rate_limit.maxAttempts).toBe(4);
    expect(DEFAULT_RETRY_CONFIGS.rate_limit.baseDelayMs).toBe(2000);
    expect(DEFAULT_RETRY_CONFIGS.rate_limit.maxDelayMs).toBe(30000);
    expect(DEFAULT_RETRY_CONFIGS.rate_limit.backoffFactor).toBe(2);
  });

  test("auth_error: 1 attempt, no retry", () => {
    expect(DEFAULT_RETRY_CONFIGS.auth_error.maxAttempts).toBe(1);
  });

  test("manifest_invalid + permission_denied + eval_failure: all 1 attempt", () => {
    expect(DEFAULT_RETRY_CONFIGS.manifest_invalid.maxAttempts).toBe(1);
    expect(DEFAULT_RETRY_CONFIGS.permission_denied.maxAttempts).toBe(1);
    expect(DEFAULT_RETRY_CONFIGS.eval_failure.maxAttempts).toBe(1);
  });
});

describe("getRetryConfig", () => {
  test("returns canonical default when no overrides", () => {
    const c = getRetryConfig("rate_limit");
    expect(c).toEqual(DEFAULT_RETRY_CONFIGS.rate_limit);
  });

  test("merges partial overrides", () => {
    const c = getRetryConfig("rate_limit", { maxAttempts: 6 });
    expect(c.maxAttempts).toBe(6);
    expect(c.baseDelayMs).toBe(DEFAULT_RETRY_CONFIGS.rate_limit.baseDelayMs);
  });
});

describe("computeDelay", () => {
  test("returns 0 when baseDelayMs is 0", () => {
    expect(computeDelay({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 }, 1, () => 0)).toBe(0);
  });

  test("exponential backoff increases with attempt", () => {
    const config = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 100000, backoffFactor: 2 };
    const noJitter = () => 0;

    const a1 = computeDelay(config, 1, noJitter);
    const a2 = computeDelay(config, 2, noJitter);
    const a3 = computeDelay(config, 3, noJitter);

    expect(a1).toBe(1000); // 1000 * 2^0
    expect(a2).toBe(2000); // 1000 * 2^1
    expect(a3).toBe(4000); // 1000 * 2^2
  });

  test("caps at maxDelayMs", () => {
    const config = { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 5000, backoffFactor: 2 };
    const noJitter = () => 0;

    expect(computeDelay(config, 4, noJitter)).toBe(5000); // 1000 * 2^3 = 8000, capped at 5000
    expect(computeDelay(config, 10, noJitter)).toBe(5000);
  });

  test("adds 0-25% jitter", () => {
    const config = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 10000, backoffFactor: 1 };
    const fullJitter = () => 1; // max 25%
    const halfJitter = () => 0.5; // 12.5%

    expect(computeDelay(config, 1, fullJitter)).toBe(1250); // 1000 + 25%
    expect(computeDelay(config, 1, halfJitter)).toBe(1125); // 1000 + 12.5%
  });
});

describe("shouldRetry", () => {
  test("retries when attempt < maxAttempts", () => {
    const decision = shouldRetry("rate_limit", 1, undefined, () => 0);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.attempt).toBe(1);
    expect(decision.maxAttempts).toBe(4);
    expect(decision.delayMs).toBeGreaterThan(0);
  });

  test("does not retry when attempt >= maxAttempts", () => {
    const decision = shouldRetry("rate_limit", 4, undefined, () => 0);
    expect(decision.shouldRetry).toBe(false);
  });

  test("auth_error never retries (maxAttempts=1)", () => {
    const decision = shouldRetry("auth_error", 1, undefined, () => 0);
    expect(decision.shouldRetry).toBe(false);
  });
});

describe("withRetry", () => {
  test("returns immediately on success", async () => {
    const fn = mock(async () => "ok");
    const result = await withRetry(fn, { sleep: async () => {} });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries retryable errors up to maxAttempts", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error("rate limit exceeded");
      return "ok";
    };
    const result = await withRetry(fn, { sleep: async () => {}, jitter: () => 0 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("re-throws non-retryable errors immediately", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("API error: 401 unauthorized");
    };
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });

  test("re-throws retryable errors after exhausting attempts", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("ECONNRESET");
    };
    await expect(withRetry(fn, { sleep: async () => {}, jitter: () => 0 })).rejects.toThrow(
      /ECONNRESET/,
    );
    // gateway_timeout has maxAttempts: 3
    expect(calls).toBe(3);
  });

  test("calls onRetry between attempts", async () => {
    let calls = 0;
    const onRetry = mock(async () => {});
    const fn = async () => {
      calls++;
      if (calls < 2) throw new Error("rate limit");
      return "ok";
    };
    await withRetry(fn, { sleep: async () => {}, jitter: () => 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("respects per-category overrides", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("rate limit");
    };
    // Override rate_limit to allow only 2 attempts instead of default 4
    await expect(
      withRetry(fn, {
        sleep: async () => {},
        jitter: () => 0,
        overrides: { rate_limit: { maxAttempts: 2 } },
      }),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });

  test("aborts cleanly when signal fires before next attempt", async () => {
    const ac = new AbortController();
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        ac.abort(new Error("user-aborted"));
        throw new Error("rate limit");
      }
      return "ok";
    };
    await expect(
      withRetry(fn, { sleep: async () => {}, jitter: () => 0, signal: ac.signal }),
    ).rejects.toThrow(/aborted/);
  });
});
