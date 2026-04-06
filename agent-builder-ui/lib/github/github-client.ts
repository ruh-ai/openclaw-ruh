/**
 * GitHub REST API client using a Personal Access Token.
 * No external dependencies — uses fetch directly.
 */

const GITHUB_API = "https://api.github.com";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface GitHubPushResult {
  ok: boolean;
  repoUrl: string | null;
  commitSha: string | null;
  filesPushed: number;
  error: string | null;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** Validate a PAT and return the authenticated user.
 *  Routes through /api/github proxy to avoid browser CORS issues. */
export async function validateToken(token: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch("/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? (data.user as GitHubUser) : null;
  } catch {
    return null;
  }
}

/** Generate a unique repo name from agent name. */
export function generateRepoName(agentName: string): string {
  const slug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "agent"}-${suffix}`;
}

/** Create a repo if it doesn't exist. Returns the full repo name (owner/repo). */
async function ensureRepo(
  token: string,
  owner: string,
  repoName: string,
  description: string,
): Promise<{ ok: boolean; fullName: string; error?: string }> {
  // Check if repo exists
  const check = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}`, {
    headers: headers(token),
  });
  if (check.ok) {
    return { ok: true, fullName: `${owner}/${repoName}` };
  }

  // Create it
  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: repoName,
      description,
      private: false,
      auto_init: true, // creates initial commit so we can push via API
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" }));
    return { ok: false, fullName: "", error: (err as { message: string }).message };
  }

  const repo = (await res.json()) as { full_name: string };
  // Wait for GitHub to initialize the repo
  await new Promise((r) => setTimeout(r, 2000));
  return { ok: true, fullName: repo.full_name };
}

/** Push files to a GitHub repo using the Git Trees + Commits API. */
export async function pushAgentToGithub(
  token: string,
  owner: string,
  repoName: string,
  agentName: string,
  files: Array<{ path: string; content: string }>,
): Promise<GitHubPushResult> {
  try {
    // 1. Ensure repo exists
    const repo = await ensureRepo(
      token,
      owner,
      repoName,
      `${agentName} — AI agent built with Ruh.ai`,
    );
    if (!repo.ok) {
      return { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: repo.error ?? "Failed to create repo" };
    }

    const repoUrl = `https://github.com/${repo.fullName}`;
    const apiBase = `${GITHUB_API}/repos/${repo.fullName}`;

    // 2. Get the default branch's latest commit SHA
    const refRes = await fetch(`${apiBase}/git/ref/heads/main`, {
      headers: headers(token),
    });
    if (!refRes.ok) {
      return { ok: false, repoUrl, commitSha: null, filesPushed: 0, error: "Could not read main branch" };
    }
    const refData = (await refRes.json()) as { object: { sha: string } };
    const parentSha = refData.object.sha;

    // 3. Get the tree SHA of the parent commit
    const commitRes = await fetch(`${apiBase}/git/commits/${parentSha}`, {
      headers: headers(token),
    });
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // 4. Create blobs for each file
    const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const file of files) {
      const blobRes = await fetch(`${apiBase}/git/blobs`, {
        method: "POST",
        headers: { ...headers(token), "Content-Type": "application/json" },
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      });
      if (!blobRes.ok) continue;
      const blob = (await blobRes.json()) as { sha: string };
      treeEntries.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    // 5. Create a new tree
    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) {
      return { ok: false, repoUrl, commitSha: null, filesPushed: 0, error: "Failed to create git tree" };
    }
    const tree = (await treeRes.json()) as { sha: string };

    // 6. Create a new commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `ship: ${agentName} agent template\n\nBuilt with Ruh.ai`,
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    if (!newCommitRes.ok) {
      return { ok: false, repoUrl, commitSha: null, filesPushed: 0, error: "Failed to create commit" };
    }
    const newCommit = (await newCommitRes.json()) as { sha: string };

    // 7. Update the ref to point to the new commit
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/main`, {
      method: "PATCH",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha }),
    });
    if (!updateRefRes.ok) {
      return { ok: false, repoUrl, commitSha: newCommit.sha, filesPushed: treeEntries.length, error: "Commit created but failed to update branch" };
    }

    return {
      ok: true,
      repoUrl,
      commitSha: newCommit.sha,
      filesPushed: treeEntries.length,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      repoUrl: null,
      commitSha: null,
      filesPushed: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─── localStorage token management ──────────────────────────────────────────

const TOKEN_KEY = "ruh-github-token";
const USER_KEY = "ruh-github-user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): GitHubUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as GitHubUser) : null;
  } catch {
    return null;
  }
}

export function storeCredentials(token: string, user: GitHubUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearCredentials(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
