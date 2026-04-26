import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import path from 'path';
import fs from 'fs';
import {
  createWorktree,
  removeWorktree,
  pruneStaleWorktrees,
  listHermesWorktrees,
  type WorktreeInfo,
} from './worktreeManager';

// These tests run actual git commands against a temporary repo.
// This avoids mocking complexity and tests the real worktree lifecycle.

const TEST_DIR = path.join(import.meta.dir, '__test_repo__');

async function run(cmd: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  await proc.exited;
  return new Response(proc.stdout).text();
}

async function setupTestRepo(): Promise<string> {
  const repoDir = path.join(TEST_DIR, `repo-${Date.now()}`);
  fs.mkdirSync(repoDir, { recursive: true });

  // Initialize a git repo with an initial commit
  await run(['git', 'init'], repoDir);
  await run(['git', 'config', 'user.email', 'test@test.com'], repoDir);
  await run(['git', 'config', 'user.name', 'Test'], repoDir);
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test\n');

  // Create the .claude/agents directory to simulate agent files
  const agentsDir = path.join(repoDir, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, 'backend.md'), '# Backend Agent\n');

  // Create the worktrees directory
  fs.mkdirSync(path.join(repoDir, '.claude', 'worktrees'), { recursive: true });

  await run(['git', 'add', '-A'], repoDir);
  await run(['git', 'commit', '-m', 'initial commit'], repoDir);

  return repoDir;
}

function cleanupTestRepo(repoDir: string): void {
  try {
    fs.rmSync(repoDir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

describe('worktreeManager', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await setupTestRepo();
  });

  afterEach(() => {
    cleanupTestRepo(repoDir);
  });

  describe('createWorktree', () => {
    it('creates a worktree with correct branch name and path', async () => {
      const info = await createWorktree({
        jobId: 'abc12345-long-id',
        agentName: 'backend',
        projectRoot: repoDir,
      });

      expect(info.created).toBe(true);
      expect(info.branchName).toBe('hermes/backend/abc12345');
      expect(info.worktreePath).toBe(path.join(repoDir, '.claude/worktrees/hermes-abc12345'));
      expect(info.baseBranch).toBeTruthy();

      // Verify the worktree directory exists
      expect(fs.existsSync(info.worktreePath)).toBe(true);

      // Verify the agent file exists in the worktree
      expect(fs.existsSync(path.join(info.worktreePath, '.claude', 'agents', 'backend.md'))).toBe(true);

      // Verify the branch exists
      const branches = await run(['git', 'branch'], repoDir);
      expect(branches).toContain('hermes/backend/abc12345');
    });

    it('handles retry by cleaning up existing branch', async () => {
      // First attempt
      const first = await createWorktree({
        jobId: 'retry-job1',
        agentName: 'frontend',
        projectRoot: repoDir,
      });
      expect(first.created).toBe(true);

      // Clean up worktree but leave branch (simulating partial cleanup)
      await run(['git', 'worktree', 'remove', first.worktreePath, '--force'], repoDir);

      // Second attempt with same jobId should succeed
      const second = await createWorktree({
        jobId: 'retry-job1',
        agentName: 'frontend',
        projectRoot: repoDir,
      });
      expect(second.created).toBe(true);
      expect(fs.existsSync(second.worktreePath)).toBe(true);
    });

    it('falls back gracefully with created=false on invalid projectRoot', async () => {
      const info = await createWorktree({
        jobId: 'fail-job',
        agentName: 'backend',
        projectRoot: '/nonexistent/path',
      });

      expect(info.created).toBe(false);
      expect(info.worktreePath).toBe('/nonexistent/path');
    });

    it('sanitizes special characters in jobId', async () => {
      const info = await createWorktree({
        jobId: 'abc@#$%^&*123',
        agentName: 'backend',
        projectRoot: repoDir,
      });

      expect(info.created).toBe(true);
      expect(info.branchName).toBe('hermes/backend/abc123');
      // Branch name should only contain safe characters
      expect(info.branchName).not.toMatch(/[@#$%^&*]/);
    });
  });

  describe('removeWorktree', () => {
    it('removes worktree directory but preserves branch when deleteBranch=false', async () => {
      const info = await createWorktree({
        jobId: 'keep-branch',
        agentName: 'backend',
        projectRoot: repoDir,
      });

      await removeWorktree(info, { deleteBranch: false });

      // Worktree directory should be gone
      expect(fs.existsSync(info.worktreePath)).toBe(false);

      // Branch should still exist
      const branches = await run(['git', 'branch'], repoDir);
      expect(branches).toContain('hermes/backend/keep-bra');
    });

    it('removes both worktree and branch when deleteBranch=true', async () => {
      const info = await createWorktree({
        jobId: 'delete-all',
        agentName: 'backend',
        projectRoot: repoDir,
      });

      await removeWorktree(info, { deleteBranch: true });

      // Both should be gone
      expect(fs.existsSync(info.worktreePath)).toBe(false);
      const branches = await run(['git', 'branch'], repoDir);
      expect(branches).not.toContain('hermes/backend/delete-a');
    });

    it('is a no-op when info.created is false', async () => {
      const info: WorktreeInfo = {
        worktreePath: repoDir,
        branchName: 'hermes/test/fake',
        baseBranch: 'main',
        created: false,
      };

      // Should not throw
      await removeWorktree(info, { deleteBranch: true });
    });
  });

  describe('pruneStaleWorktrees', () => {
    it('removes hermes worktrees and returns count', async () => {
      // Create two worktrees
      await createWorktree({ jobId: 'stale-1aa', agentName: 'backend', projectRoot: repoDir });
      await createWorktree({ jobId: 'stale-2bb', agentName: 'frontend', projectRoot: repoDir });

      // Both should exist
      const before = await listHermesWorktrees(repoDir);
      expect(before.length).toBe(2);

      // Prune them
      const pruned = await pruneStaleWorktrees(repoDir);
      expect(pruned).toBe(2);

      // None should remain
      const after = await listHermesWorktrees(repoDir);
      expect(after.length).toBe(0);
    });

    it('returns 0 when no hermes worktrees exist', async () => {
      const pruned = await pruneStaleWorktrees(repoDir);
      expect(pruned).toBe(0);
    });
  });

  describe('listHermesWorktrees', () => {
    it('lists only hermes worktrees', async () => {
      await createWorktree({ jobId: 'list-1aaa', agentName: 'backend', projectRoot: repoDir });
      await createWorktree({ jobId: 'list-2bbb', agentName: 'frontend', projectRoot: repoDir });

      const worktrees = await listHermesWorktrees(repoDir);
      expect(worktrees.length).toBe(2);
      expect(worktrees.every(p => p.includes('.claude/worktrees/hermes-'))).toBe(true);
    });

    it('returns empty array for invalid repo', async () => {
      const worktrees = await listHermesWorktrees('/nonexistent');
      expect(worktrees).toEqual([]);
    });
  });
});

// Clean up the test directory after all tests
afterEach(() => {
  try {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  } catch { /* best effort */ }
});
