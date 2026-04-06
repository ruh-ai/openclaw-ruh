/**
 * agentRepo.ts — Persistent GitHub repo management for agents.
 *
 * Each agent gets ONE repo, created on first ship. Subsequent ships
 * push to the same repo. The repo URL is stored on the agent record.
 *
 * Replaces the throwaway-repo model where every Ship created a new
 * repo with a random suffix.
 */

import { dockerExec, getContainerName } from './docker';
import * as agentStore from './agentStore';

export interface ShipOptions {
  agentId: string;
  sandboxId: string;
  githubToken: string;
  repoName?: string;      // override auto-generated name
  commitMessage?: string;
  onLog?: (msg: string) => void;
}

export interface ShipResult {
  ok: boolean;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  commitSha: string | null;
  filesPushed: number;
  isFirstShip: boolean;
  error: string | null;
}

/**
 * Generate a clean repo name from an agent name.
 * "Armond - Hotel Manager" → "armond-hotel-manager"
 */
function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "agent";
}

/**
 * Get the GitHub username for a PAT token.
 */
async function getGitHubUser(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `token ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as { login?: string };
    return data.login ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a GitHub repo if it doesn't exist.
 */
async function ensureRepo(
  token: string,
  owner: string,
  repoName: string,
  description: string,
): Promise<{ ok: boolean; fullName: string; error?: string }> {
  // Check if exists
  const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
    headers: { Authorization: `token ${token}`, Accept: "application/json" },
  });

  if (checkRes.status === 200) {
    return { ok: true, fullName: `${owner}/${repoName}` };
  }

  // Create under the authenticated user
  const createRes = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: { Authorization: `token ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: repoName,
      private: true,
      description,
      auto_init: false,
    }),
  });

  if (createRes.status === 201) {
    const created = await createRes.json() as { full_name?: string };
    return { ok: true, fullName: created.full_name ?? `${owner}/${repoName}` };
  }

  // Try under org
  const orgRes = await fetch(`https://api.github.com/orgs/${owner}/repos`, {
    method: "POST",
    headers: { Authorization: `token ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: repoName,
      private: true,
      description,
      auto_init: false,
    }),
  });

  if (orgRes.status === 201) {
    const created = await orgRes.json() as { full_name?: string };
    return { ok: true, fullName: created.full_name ?? `${owner}/${repoName}` };
  }

  const errText = await orgRes.text().catch(() => "");
  return { ok: false, fullName: `${owner}/${repoName}`, error: `Failed to create repo: ${errText.slice(0, 200)}` };
}

/**
 * Ship an agent's workspace to GitHub.
 *
 * First ship: creates the repo, pushes, stores repo_url on agent.
 * Subsequent ships: pushes to the existing repo.
 */
export async function shipAgent(opts: ShipOptions): Promise<ShipResult> {
  const log = opts.onLog ?? (() => {});
  const containerName = getContainerName(opts.sandboxId);

  // Load agent to check for existing repo
  const agent = await agentStore.getAgent(opts.agentId);
  if (!agent) {
    return { ok: false, repoUrl: "", repoOwner: "", repoName: "", commitSha: null, filesPushed: 0, isFirstShip: false, error: "Agent not found" };
  }

  const isFirstShip = !agent.repo_url;
  let repoOwner = agent.repo_owner ?? "";
  let repoName = agent.repo_name ?? "";
  let repoSlug = agent.repo_url ? agent.repo_url.replace("https://github.com/", "") : "";

  // First ship: determine owner and name
  if (isFirstShip) {
    log("First ship — setting up repository...");

    // Get GitHub username from token
    const ghUser = await getGitHubUser(opts.githubToken);
    if (!ghUser) {
      return { ok: false, repoUrl: "", repoOwner: "", repoName: "", commitSha: null, filesPushed: 0, isFirstShip: true, error: "Invalid GitHub token — could not determine username" };
    }
    repoOwner = ghUser;
    repoName = opts.repoName ?? slugifyAgentName(agent.name);
    repoSlug = `${repoOwner}/${repoName}`;

    // Create repo
    log(`Creating repo ${repoSlug}...`);
    const createResult = await ensureRepo(opts.githubToken, repoOwner, repoName, `${agent.name} — built with Ruh.ai`);
    if (!createResult.ok) {
      return { ok: false, repoUrl: `https://github.com/${repoSlug}`, repoOwner, repoName, commitSha: null, filesPushed: 0, isFirstShip: true, error: createResult.error ?? "Failed to create repo" };
    }
    // Use the actual full name (may differ if created under org)
    repoSlug = createResult.fullName;
    const parts = repoSlug.split("/");
    repoOwner = parts[0];
    repoName = parts.slice(1).join("/");
  } else {
    log(`Updating existing repo ${repoSlug}...`);
  }

  const httpsUrl = `https://x-access-token:${opts.githubToken}@github.com/${repoSlug}.git`;
  const commitMessage = opts.commitMessage ?? `${isFirstShip ? "ship" : "update"}: ${agent.name}`;

  // Ensure git is installed
  log("Preparing workspace...");
  await dockerExec(containerName, 'which git || (apt-get update -qq && apt-get install -y --no-install-recommends git >/dev/null 2>&1)', 60_000);

  // Set up git and .gitignore
  await dockerExec(containerName, [
    'cd ~/.openclaw/workspace',
    'git init 2>/dev/null',
    'git config user.email "agent@ruh.ai"',
    'git config user.name "Ruh Agent Builder"',
    // Write .gitignore (idempotent)
    'cat > .gitignore << "ENDGI"',
    'node_modules/',
    'dist/',
    '.env',
    '*.log',
    '.DS_Store',
    '.soul.architect.md',
    'BOOTSTRAP.md',
    'USER.md',
    '.openclaw/workspace-state.json',
    'ENDGI',
    // Commit .gitignore first so git add -A respects it
    'git add .gitignore',
    'git diff --cached --quiet .gitignore 2>/dev/null || git commit -m "chore: gitignore" 2>/dev/null',
    // Remove node_modules from tracking if accidentally added before
    'git rm -r --cached node_modules 2>/dev/null || true',
  ].join(' && '), 15_000);

  // Stage and commit
  log("Staging files...");
  const [, countOutput] = await dockerExec(containerName, [
    'cd ~/.openclaw/workspace',
    'git add -A',
    'git status --porcelain | wc -l',
  ].join(' && '), 30_000);
  const fileCount = parseInt(countOutput.trim(), 10) || 0;

  if (fileCount === 0) {
    log("No changes to push.");
    // Still update agent record with repo info (important for first ship)
    const repoUrl = `https://github.com/${repoSlug}`;
    if (isFirstShip || !agent.repo_url) {
      await agentStore.updateAgentConfig(opts.agentId, { repoUrl, repoOwner, repoName, repoLastPushedAt: new Date().toISOString() });
    }
    return { ok: true, repoUrl, repoOwner, repoName, commitSha: null, filesPushed: 0, isFirstShip, error: null };
  }

  log(`Committing ${fileCount} files...`);
  await dockerExec(containerName, [
    'cd ~/.openclaw/workspace',
    `git commit -m "${commitMessage.replace(/"/g, '\\"')}" --allow-empty`,
  ].join(' && '), 15_000);

  // Push
  log("Pushing to GitHub...");
  const [pushOk, pushOutput] = await dockerExec(containerName, [
    'cd ~/.openclaw/workspace',
    `git remote remove origin 2>/dev/null; git remote add origin '${httpsUrl}'`,
    'git branch -M main',
    'git push -u origin main --force 2>&1',
  ].join(' && '), 60_000);

  if (!pushOk) {
    return { ok: false, repoUrl: `https://github.com/${repoSlug}`, repoOwner, repoName, commitSha: null, filesPushed: fileCount, isFirstShip, error: `Push failed: ${pushOutput.slice(0, 300)}` };
  }

  // Get commit SHA
  const [, sha] = await dockerExec(containerName, 'cd ~/.openclaw/workspace && git rev-parse HEAD', 5_000);

  // Update agent record with repo info
  const repoUrl = `https://github.com/${repoSlug}`;
  await agentStore.updateAgentConfig(opts.agentId, {
    repoUrl,
    repoOwner,
    repoName,
    repoLastPushedAt: new Date().toISOString(),
  });

  log(`${isFirstShip ? "Shipped" : "Updated"} ${fileCount} files → ${repoUrl}`);
  return { ok: true, repoUrl, repoOwner, repoName, commitSha: sha.trim() || null, filesPushed: fileCount, isFirstShip, error: null };
}
