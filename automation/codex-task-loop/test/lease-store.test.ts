import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LeaseStore } from "../src/lease-store.js";

async function withStore(run: (store: LeaseStore) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "codex-task-loop-"));
  try {
    await run(new LeaseStore(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("creates and reads a lease", async () => {
  await withStore(async (store) => {
    const lease = {
      issueId: "RUH-208",
      branchName: "codex/ruh-208",
      runId: "run-1",
      hostname: "vm-1",
      startedAt: "2026-03-10T00:00:00.000Z",
      heartbeatAt: "2026-03-10T00:05:00.000Z",
      retryCount: 0,
    };

    await store.write(lease);

    assert.deepEqual(await store.read(), lease);
  });
});

test("detects stale leases based on ttl", async () => {
  await withStore(async (store) => {
    await store.write({
      issueId: "RUH-209",
      branchName: "codex/ruh-209",
      runId: "run-2",
      hostname: "vm-1",
      startedAt: "2026-03-10T00:00:00.000Z",
      heartbeatAt: "2026-03-10T00:05:00.000Z",
      retryCount: 1,
    });

    assert.equal(
      await store.isStale("2026-03-10T03:06:00.000Z", 2 * 60 * 60 * 1000),
      true,
    );
    assert.equal(
      await store.isStale("2026-03-10T01:00:00.000Z", 2 * 60 * 60 * 1000),
      false,
    );
  });
});

test("renews lease heartbeat", async () => {
  await withStore(async (store) => {
    await store.write({
      issueId: "RUH-210",
      branchName: "codex/ruh-210",
      runId: "run-3",
      hostname: "vm-1",
      startedAt: "2026-03-10T00:00:00.000Z",
      heartbeatAt: "2026-03-10T00:05:00.000Z",
      retryCount: 2,
    });

    await store.renew("2026-03-10T00:15:00.000Z");

    assert.equal((await store.read())?.heartbeatAt, "2026-03-10T00:15:00.000Z");
  });
});

test("releases the active lease", async () => {
  await withStore(async (store) => {
    await store.write({
      issueId: "RUH-211",
      branchName: "codex/ruh-211",
      runId: "run-4",
      hostname: "vm-1",
      startedAt: "2026-03-10T00:00:00.000Z",
      heartbeatAt: "2026-03-10T00:05:00.000Z",
      retryCount: 0,
    });

    await store.release();

    assert.equal(await store.read(), null);
  });
});
