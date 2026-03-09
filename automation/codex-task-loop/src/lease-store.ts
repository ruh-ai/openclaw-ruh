import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { readJsonFile, removeFile, writeJsonFile } from "./state.js";

export interface TaskLease {
  issueId: string;
  branchName: string;
  runId: string;
  hostname: string;
  startedAt: string;
  heartbeatAt: string;
  retryCount: number;
}

export class LeaseStore {
  private readonly leasePath: string;
  private readonly lockPath: string;

  constructor(private readonly rootDir: string) {
    this.leasePath = join(rootDir, "state", "active-lease.json");
    this.lockPath = join(rootDir, "state", "active-lease.lock");
  }

  read(): Promise<TaskLease | null> {
    return readJsonFile<TaskLease>(this.leasePath);
  }

  async write(lease: TaskLease): Promise<void> {
    await this.withLock(async () => {
      await writeJsonFile(this.leasePath, lease);
    });
  }

  async renew(heartbeatAt: string): Promise<void> {
    await this.withLock(async () => {
      const currentLease = await this.read();
      if (!currentLease) {
        throw new Error("Cannot renew lease: no active lease");
      }

      await writeJsonFile(this.leasePath, { ...currentLease, heartbeatAt });
    });
  }

  async release(): Promise<void> {
    await this.withLock(async () => {
      await removeFile(this.leasePath);
    });
  }

  async isStale(now: string, ttlMs: number): Promise<boolean> {
    const currentLease = await this.read();
    if (!currentLease) {
      return false;
    }

    return Date.parse(now) - Date.parse(currentLease.heartbeatAt) > ttlMs;
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireLock();
    try {
      return await operation();
    } finally {
      await this.releaseLock();
    }
  }

  private async acquireLock(): Promise<void> {
    await mkdir(join(this.rootDir, "state"), { recursive: true });
    await mkdir(this.lockPath);
  }

  private async releaseLock(): Promise<void> {
    await rm(this.lockPath, { recursive: true, force: true });
  }
}
