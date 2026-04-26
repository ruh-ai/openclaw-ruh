import path from 'path';
import { spawn } from 'bun';

// ── Types ────────────────────────────────────────────────────

export interface WorktreeInfo {
  worktreePath: string;     // .claude/worktrees/hermes-<jobId>
  branchName: string;       // hermes/<agentName>/<jobId-short>
  baseBranch: string;       // branch at time of creation (from git HEAD)
  created: boolean;         // false if fallback to repo root
}

export interface WorktreeCreateOpts {
  jobId: string;
  agentName: string;
  projectRoot: string;
}

interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ── Constants ────────────────────────────────────────────────

const WORKTREE_DIR = '.claude/worktrees';
const WORKTREE_PREFIX = 'hermes-';
const BRANCH_PREFIX = 'hermes/';
const GIT_TIMEOUT_MS = 15_000;

// ── Internal Helpers ─────────────────────────────────────────

async function execGit(args: string[], cwd: string): Promise<GitResult> {
  const proc = spawn({
    cmd: ['git', ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
  });

  const timeoutId = setTimeout(() => {
    try { proc.kill('SIGTERM'); } catch { /* already dead */ }
  }, GIT_TIMEOUT_MS);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

function shortJobId(jobId: string): string {
  // Use first 8 chars, stripping any non-alphanumeric for branch safety
  return jobId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8);
}

function buildBranchName(agentName: string, jobId: string): string {
  return `${BRANCH_PREFIX}${agentName}/${shortJobId(jobId)}`;
}

function buildWorktreePath(projectRoot: string, jobId: string): string {
  return path.join(projectRoot, WORKTREE_DIR, `${WORKTREE_PREFIX}${shortJobId(jobId)}`);
}

// ── Public API ───────────────────────────────────────────────

/**
 * Create a git worktree for an execution job.
 *
 * Creates a branch from HEAD and a worktree directory at
 * `.claude/worktrees/hermes-<jobId-short>`.
 *
 * On failure, returns { created: false } with worktreePath = projectRoot
 * so the caller can fall back to running in the main repo.
 */
export async function createWorktree(opts: WorktreeCreateOpts): Promise<WorktreeInfo> {
  const { jobId, agentName, projectRoot } = opts;
  const branchName = buildBranchName(agentName, jobId);
  const worktreePath = buildWorktreePath(projectRoot, jobId);

  const fallback: WorktreeInfo = {
    worktreePath: projectRoot,
    branchName,
    baseBranch: '',
    created: false,
  };

  try {
    // 1. Get current HEAD branch
    const headResult = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], projectRoot);
    if (headResult.exitCode !== 0) {
      console.warn(`[hermes:worktree] Failed to resolve HEAD: ${headResult.stderr}`);
      return fallback;
    }
    const baseBranch = headResult.stdout;

    // 2. Clean up stale branch from a prior attempt (retry case)
    const branchCheck = await execGit(['rev-parse', '--verify', branchName], projectRoot);
    if (branchCheck.exitCode === 0) {
      // Branch exists — check if a worktree is still attached
      const wtCheck = await execGit(['worktree', 'list', '--porcelain'], projectRoot);
      const hasWorktree = wtCheck.stdout.includes(worktreePath);
      if (hasWorktree) {
        await execGit(['worktree', 'remove', worktreePath, '--force'], projectRoot);
      }
      await execGit(['branch', '-D', branchName], projectRoot);
    }

    // 3. Create branch from HEAD
    const branchResult = await execGit(['branch', branchName, 'HEAD'], projectRoot);
    if (branchResult.exitCode !== 0) {
      console.warn(`[hermes:worktree] Failed to create branch ${branchName}: ${branchResult.stderr}`);
      return fallback;
    }

    // 4. Create worktree
    const wtResult = await execGit(['worktree', 'add', worktreePath, branchName], projectRoot);
    if (wtResult.exitCode !== 0) {
      console.warn(`[hermes:worktree] Failed to create worktree at ${worktreePath}: ${wtResult.stderr}`);
      // Clean up the branch we just created
      await execGit(['branch', '-D', branchName], projectRoot);
      return fallback;
    }

    return {
      worktreePath,
      branchName,
      baseBranch,
      created: true,
    };
  } catch (error) {
    console.warn(`[hermes:worktree] Unexpected error creating worktree:`, error);
    return fallback;
  }
}

/**
 * Remove a git worktree and optionally its branch.
 *
 * On success: call with deleteBranch=false to preserve the branch for review.
 * On failure: call with deleteBranch=true to clean up completely.
 *
 * Best-effort — logs warnings but never throws.
 */
export async function removeWorktree(
  info: WorktreeInfo,
  opts?: { deleteBranch?: boolean },
): Promise<void> {
  if (!info.created) return;

  // Extract projectRoot from worktreePath by walking up past .claude/worktrees/<name>
  const projectRoot = path.resolve(info.worktreePath, '..', '..', '..');

  try {
    const result = await execGit(['worktree', 'remove', info.worktreePath, '--force'], projectRoot);
    if (result.exitCode !== 0 && !result.stderr.includes('is not a working tree')) {
      console.warn(`[hermes:worktree] Failed to remove worktree ${info.worktreePath}: ${result.stderr}`);
    }
  } catch (error) {
    console.warn(`[hermes:worktree] Error removing worktree:`, error);
  }

  if (opts?.deleteBranch && info.branchName) {
    try {
      await execGit(['branch', '-D', info.branchName], projectRoot);
    } catch (error) {
      console.warn(`[hermes:worktree] Error deleting branch ${info.branchName}:`, error);
    }
  }

  // Prune to clean up any dangling references
  try {
    await execGit(['worktree', 'prune'], projectRoot);
  } catch { /* best effort */ }
}

/**
 * Clean up stale hermes worktrees from previous runs.
 * Called at startup to prevent accumulation.
 * Returns the number of worktrees pruned.
 */
export async function pruneStaleWorktrees(projectRoot: string): Promise<number> {
  let pruned = 0;

  try {
    const result = await execGit(['worktree', 'list', '--porcelain'], projectRoot);
    if (result.exitCode !== 0) return 0;

    // Parse porcelain output: each worktree is a block separated by blank lines
    // Format:
    //   worktree /path/to/worktree
    //   HEAD <sha>
    //   branch refs/heads/<name>
    //   <blank line>
    const hermesWorktreeDir = path.join(projectRoot, WORKTREE_DIR);
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.replace('worktree ', '').trim();
        if (wtPath.startsWith(hermesWorktreeDir) && path.basename(wtPath).startsWith(WORKTREE_PREFIX)) {
          console.log(`[hermes:worktree] Pruning stale worktree: ${wtPath}`);
          const removeResult = await execGit(['worktree', 'remove', wtPath, '--force'], projectRoot);
          if (removeResult.exitCode === 0) {
            pruned++;
          } else {
            console.warn(`[hermes:worktree] Failed to prune ${wtPath}: ${removeResult.stderr}`);
          }
        }
      }
    }

    // Final prune to clean up dangling references
    if (pruned > 0) {
      await execGit(['worktree', 'prune'], projectRoot);
    }
  } catch (error) {
    console.warn(`[hermes:worktree] Error during stale worktree cleanup:`, error);
  }

  return pruned;
}

/**
 * List active hermes worktree paths.
 */
export async function listHermesWorktrees(projectRoot: string): Promise<string[]> {
  try {
    const result = await execGit(['worktree', 'list', '--porcelain'], projectRoot);
    if (result.exitCode !== 0) return [];

    const hermesWorktreeDir = path.join(projectRoot, WORKTREE_DIR);
    const paths: string[] = [];

    for (const line of result.stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.replace('worktree ', '').trim();
        if (wtPath.startsWith(hermesWorktreeDir) && path.basename(wtPath).startsWith(WORKTREE_PREFIX)) {
          paths.push(wtPath);
        }
      }
    }

    return paths;
  } catch {
    return [];
  }
}
