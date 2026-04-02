/**
 * POST /api/github
 *
 * Server-side proxy for GitHub API calls. Avoids CORS issues
 * when calling api.github.com directly from the browser.
 *
 * Actions: "validate" (check PAT), "push" (push agent files to repo)
 */

import { NextRequest, NextResponse } from "next/server";

const GITHUB_API = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function handleValidate(token: string) {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `GitHub returned ${res.status}` },
      { status: 401 },
    );
  }
  const user = await res.json();
  return NextResponse.json({
    ok: true,
    user: {
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
    },
  });
}

async function handlePush(
  token: string,
  owner: string,
  repoName: string,
  agentName: string,
  files: Array<{ path: string; content: string }>,
) {
  const apiBase = `${GITHUB_API}/repos/${owner}/${repoName}`;
  const h = ghHeaders(token);

  // 1. Ensure repo exists
  const repoCheck = await fetch(`${apiBase}`, { headers: h });
  if (!repoCheck.ok) {
    const createRes = await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        name: repoName,
        description: `${agentName} — AI agent built with Ruh.ai`,
        private: false,
        auto_init: true,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({ message: "Unknown" }));
      return NextResponse.json({ ok: false, error: `Failed to create repo: ${(err as { message: string }).message}` }, { status: 502 });
    }
    // Wait for GitHub to init
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 2. Get latest commit on main
  const refRes = await fetch(`${apiBase}/git/ref/heads/main`, { headers: h });
  if (!refRes.ok) {
    return NextResponse.json({ ok: false, error: "Could not read main branch" }, { status: 502 });
  }
  const refData = await refRes.json();
  const parentSha = refData.object.sha;

  // 3. Get parent tree
  const commitRes = await fetch(`${apiBase}/git/commits/${parentSha}`, { headers: h });
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  // 4. Create blobs
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  for (const file of files) {
    const blobRes = await fetch(`${apiBase}/git/blobs`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    if (!blobRes.ok) continue;
    const blob = await blobRes.json();
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 5. Create tree
  const treeRes = await fetch(`${apiBase}/git/trees`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!treeRes.ok) {
    return NextResponse.json({ ok: false, error: "Failed to create git tree" }, { status: 502 });
  }
  const tree = await treeRes.json();

  // 6. Create commit
  const newCommitRes = await fetch(`${apiBase}/git/commits`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      message: `ship: ${agentName} agent template\n\nBuilt with Ruh.ai`,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });
  if (!newCommitRes.ok) {
    return NextResponse.json({ ok: false, error: "Failed to create commit" }, { status: 502 });
  }
  const newCommit = await newCommitRes.json();

  // 7. Update ref
  const updateRes = await fetch(`${apiBase}/git/refs/heads/main`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return NextResponse.json({
    ok: true,
    repoUrl: `https://github.com/${owner}/${repoName}`,
    commitSha: newCommit.sha,
    filesPushed: treeEntries.length,
    error: updateRes.ok ? null : "Commit created but failed to update branch",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "Token required" }, { status: 400 });
    }

    if (action === "validate") {
      return handleValidate(token);
    }

    if (action === "push") {
      const { owner, repoName, agentName, files } = body;
      if (!owner || !repoName || !files) {
        return NextResponse.json({ ok: false, error: "owner, repoName, and files required" }, { status: 400 });
      }
      return handlePush(token, owner, repoName, agentName || "Agent", files);
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
