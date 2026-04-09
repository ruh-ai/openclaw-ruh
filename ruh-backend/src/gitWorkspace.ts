/**
 * gitWorkspace.ts — Git operations inside sandbox containers.
 *
 * All git commands run via `docker exec` inside the agent's sandbox.
 * The workspace is at `~/.openclaw/workspace/` inside the container.
 */

import { dockerExec, getContainerName, shellQuote } from './docker';

const WORKSPACE = '~/.openclaw/workspace';

const GITIGNORE_CONTENT = [
  'node_modules/',
  'dist/',
  '.env',
  '*.log',
  '.DS_Store',
  '.soul.architect.md',
  'BOOTSTRAP.md',
  'USER.md',
  '.openclaw/workspace-state.json',
].join('\\n');

export async function ensureGitInit(sandboxId: string): Promise<{ ok: boolean; error?: string }> {
  const container = getContainerName(sandboxId);
  const [gitOk] = await dockerExec(container, 'which git || (apt-get update -qq && apt-get install -y --no-install-recommends git >/dev/null 2>&1)', 60_000);
  if (!gitOk) return { ok: false, error: 'Failed to install git' };

  const [initOk, initOut] = await dockerExec(container, [
    `cd ${WORKSPACE}`, 'git init 2>/dev/null',
    'git config user.email "agent@ruh.ai"', 'git config user.name "Ruh Agent Builder"',
  ].join(' && '), 10_000);
  if (!initOk) return { ok: false, error: `git init failed: ${initOut.slice(0, 200)}` };

  await dockerExec(container, `cd ${WORKSPACE} && printf "${GITIGNORE_CONTENT}\\n" > .gitignore`, 10_000);
  await dockerExec(container, [
    `cd ${WORKSPACE}`, 'git add .gitignore',
    'git diff --cached --quiet .gitignore 2>/dev/null || git commit -m "chore: gitignore" 2>/dev/null',
    'git rm -r --cached node_modules 2>/dev/null || true',
  ].join(' && '), 15_000);
  return { ok: true };
}

export interface CommitResult { sha: string | null; filesChanged: number; }

export async function commitWorkspace(sandboxId: string, message: string): Promise<CommitResult> {
  const container = getContainerName(sandboxId);
  const [, countOutput] = await dockerExec(container, [
    `cd ${WORKSPACE}`, 'git add -A', 'git status --porcelain | wc -l',
  ].join(' && '), 30_000);
  const filesChanged = parseInt(countOutput.trim(), 10) || 0;
  if (filesChanged === 0) return { sha: null, filesChanged: 0 };

  const safeMsg = message.replace(/"/g, '\\"');
  await dockerExec(container, `cd ${WORKSPACE} && git commit -m "${safeMsg}" --allow-empty`, 15_000);
  const [, sha] = await dockerExec(container, `cd ${WORKSPACE} && git rev-parse HEAD`, 5_000);
  return { sha: sha.trim() || null, filesChanged };
}

export async function setRemoteOrigin(sandboxId: string, httpsUrl: string): Promise<boolean> {
  const container = getContainerName(sandboxId);
  const [ok] = await dockerExec(container, [
    `cd ${WORKSPACE}`, `git remote remove origin 2>/dev/null; git remote add origin ${shellQuote(httpsUrl)}`,
  ].join(' && '), 10_000);
  return ok;
}

export async function pushBranch(sandboxId: string, branch: string, force = false): Promise<{ ok: boolean; output: string }> {
  const container = getContainerName(sandboxId);
  const forceFlag = force ? ' --force' : '';
  const [ok, output] = await dockerExec(container, [
    `cd ${WORKSPACE}`, `git push -u origin ${shellQuote(branch)}${forceFlag} 2>&1`,
  ].join(' && '), 60_000);
  return { ok, output };
}

export async function createBranch(sandboxId: string, branchName: string): Promise<{ ok: boolean; error?: string }> {
  const container = getContainerName(sandboxId);
  const [ok, output] = await dockerExec(container, `cd ${WORKSPACE} && git checkout -b ${shellQuote(branchName)}`, 10_000);
  if (!ok) return { ok: false, error: `Failed to create branch: ${output.slice(0, 200)}` };
  return { ok: true };
}

export async function checkoutBranch(sandboxId: string, branchName: string): Promise<{ ok: boolean; error?: string }> {
  const container = getContainerName(sandboxId);
  const [ok, output] = await dockerExec(container, `cd ${WORKSPACE} && git checkout ${shellQuote(branchName)}`, 10_000);
  if (!ok) return { ok: false, error: `Failed to checkout: ${output.slice(0, 200)}` };
  return { ok: true };
}

export async function getCurrentBranch(sandboxId: string): Promise<string> {
  const container = getContainerName(sandboxId);
  const [, output] = await dockerExec(container, `cd ${WORKSPACE} && git rev-parse --abbrev-ref HEAD 2>/dev/null`, 5_000);
  return output.trim() || 'main';
}

export interface DiffSummary { files: string[]; additions: number; deletions: number; raw: string; }

export async function getDiffSummary(sandboxId: string, baseBranch: string, headBranch: string): Promise<DiffSummary> {
  const container = getContainerName(sandboxId);
  const [, statOutput] = await dockerExec(container, `cd ${WORKSPACE} && git diff --stat ${shellQuote(baseBranch)}...${shellQuote(headBranch)} 2>/dev/null`, 15_000);
  const [, rawDiff] = await dockerExec(container, `cd ${WORKSPACE} && git diff ${shellQuote(baseBranch)}...${shellQuote(headBranch)} 2>/dev/null`, 30_000);

  const files: string[] = [];
  let additions = 0, deletions = 0;
  for (const line of statOutput.trim().split('\n')) {
    const fileMatch = line.match(/^\s+(.+?)\s+\|/);
    if (fileMatch) files.push(fileMatch[1].trim());
    const addMatch = line.match(/(\d+) insertion/);
    if (addMatch) additions = parseInt(addMatch[1], 10);
    const delMatch = line.match(/(\d+) deletion/);
    if (delMatch) deletions = parseInt(delMatch[1], 10);
  }
  return { files, additions, deletions, raw: rawDiff.trim() };
}

export async function cloneRepo(sandboxId: string, httpsUrl: string, branch?: string): Promise<{ ok: boolean; error?: string }> {
  const container = getContainerName(sandboxId);
  await dockerExec(container, 'which git || (apt-get update -qq && apt-get install -y --no-install-recommends git >/dev/null 2>&1)', 60_000);
  const branchFlag = branch ? ` -b ${shellQuote(branch)}` : '';
  const [ok, output] = await dockerExec(container, [
    `rm -rf ${WORKSPACE}/.git ${WORKSPACE}/*`,
    `git clone --depth 50${branchFlag} ${shellQuote(httpsUrl)} ${WORKSPACE}`,
    `cd ${WORKSPACE}`, 'git config user.email "agent@ruh.ai"', 'git config user.name "Ruh Agent Builder"',
  ].join(' && '), 120_000);
  if (!ok) return { ok: false, error: `Clone failed: ${output.slice(0, 300)}` };
  return { ok: true };
}

export function buildAuthUrl(token: string, owner: string, repo: string): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

export async function createPullRequest(
  token: string, owner: string, repo: string, head: string, base: string, title: string, body: string,
): Promise<{ ok: boolean; prNumber?: number; prUrl?: string; error?: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ title, body, head, base }),
  });
  if (res.status === 201) {
    const data = await res.json() as { number?: number; html_url?: string };
    return { ok: true, prNumber: data.number, prUrl: data.html_url };
  }
  const errText = await res.text().catch(() => '');
  return { ok: false, error: `PR creation failed (${res.status}): ${errText.slice(0, 300)}` };
}

export async function squashMergePullRequest(
  token: string, owner: string, repo: string, prNumber: number, commitTitle: string,
): Promise<{ ok: boolean; sha?: string; error?: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ merge_method: 'squash', commit_title: commitTitle }),
  });
  if (res.status === 200) {
    const data = await res.json() as { sha?: string };
    return { ok: true, sha: data.sha };
  }
  const errText = await res.text().catch(() => '');
  return { ok: false, error: `Merge failed (${res.status}): ${errText.slice(0, 300)}` };
}
