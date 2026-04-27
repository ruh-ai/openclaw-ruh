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

    // Formula: ceiling = base * factor^(attempt-1), capped at maxDelayMs.
    // With no jitter: result = 0.8 * ceiling.
    expect(a1).toBe(800); // ceiling 1000, 0.8 * 1000
    expect(a2).toBe(1600); // ceiling 2000
    expect(a3).toBe(3200); // ceiling 4000
  });

  test("caps at maxDelayMs even before jitter", () => {
    const config = { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 5000, backoffFactor: 2 };
    const noJitter = () => 0;
    // ceiling = min(1000 * 2^3, 5000) = 5000; with no jitter → 0.8 * 5000 = 4000
    expect(computeDelay(config, 4, noJitter)).toBe(4000);
    expect(computeDelay(config, 10, noJitter)).toBe(4000);
  });

  test("max jitter never overshoots maxDelayMs", () => {
    const config = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 10000, backoffFactor: 1 };
    const fullJitter = () => 1; // band fully consumed
    const halfJitter = () => 0.5; // half of band

    // ceiling = 1000; base = 800; jitter band = 200
    expect(computeDelay(config, 1, fullJitter)).toBe(1000); // 800 + 200
    expect(computeDelay(config, 1, halfJitter)).toBe(900); // 800 + 100
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

  test("AbortSignal interrupts a long sleep mid-delay (Phase 1b H3)", async () => {
    // Use the real defaultSleep (no override) — it should respect the signal.
    const ac = new AbortController();
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) {
        // Abort 50ms into what would otherwise be a 30s rate_limit retry sleep
        setTimeout(() => ac.abort(new Error("user-aborted")), 50);
        throw new Error("rate limit");
      }
      return "ok";
    };
    const start = Date.now();
    await expect(
      withRetry(fn, {
        jitter: () => 0,
        signal: ac.signal,
        // override config so the test isn't waiting 2s for the first retry
        overrides: { rate_limit: { maxAttempts: 4, baseDelayMs: 5000, maxDelayMs: 30000, backoffFactor: 2 } },
      }),
    ).rejects.toThrow(/aborted/);
    const elapsed = Date.now() - start;
    // If abort wasn't honored mid-sleep, we'd wait 5s+. With abort-aware sleep,
    // we should resolve within ~150ms of the abort firing.
    expect(elapsed).toBeLessThan(500);
  });

  test("computeDelay never exceeds maxDelayMs even with maximum jitter (Phase 1b M1)", () => {
    const config = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 5000, backoffFactor: 2 };
    const maxJitter = () => 1; // worst-case jitter

    // Attempts 1-10: with backoffFactor=2 the unjittered exponential blows past
    // the cap; computeDelay should clamp the result, not overshoot.
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = computeDelay(config, attempt, maxJitter);
      expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
    }
  });
});
