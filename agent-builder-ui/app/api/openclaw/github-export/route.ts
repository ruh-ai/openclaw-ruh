/**
 * POST /api/openclaw/github-export
 *
 * Exports an agent's workspace template to a GitHub repository.
 * Creates or updates the repo with SOUL.md, skills, and config files.
 *
 * Requires a GitHub Personal Access Token (PAT) with `repo` scope.
 */

import { NextRequest, NextResponse } from "next/server";

interface GitHubExportRequest {
  /** GitHub PAT with repo scope */
  githubToken: string;
  /** Target repo in "owner/repo" format. Created if it doesn't exist. */
  repo: string;
  /** Agent name (used for commit message and repo description) */
  agentName: string;
  /** SOUL.md content */
  soulContent: string;
  /** Skill files: { [filename]: content } */
  skills: Record<string, string>;
  /** Optional config files: { [filename]: content } */
  config?: Record<string, string>;
  /** Commit message override */
  commitMessage?: string;
}

interface GitHubExportResult {
  ok: boolean;
  repoUrl: string | null;
  commitSha: string | null;
  filesPushed: number;
  error: string | null;
}

async function githubApi(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

async function ensureRepo(
  owner: string,
  repo: string,
  token: string,
  description: string,
): Promise<{ created: boolean; error?: string }> {
  // Check if repo exists
  const check = await githubApi(`/repos/${owner}/${repo}`, token);
  if (check.ok) return { created: false };

  // Try to create it
  const create = await githubApi("/user/repos", token, {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      description,
      private: true,
      auto_init: true,
    }),
  });

  if (create.ok || create.status === 422) {
    // 422 = already exists (race condition), that's fine
    return { created: create.ok };
  }

  const errBody = await create.json().catch(() => ({}));
  return {
    created: false,
    error: (errBody as Record<string, string>).message ?? `GitHub API returned ${create.status}`,
  };
}

async function getDefaultBranch(
  owner: string,
  repo: string,
  token: string,
): Promise<string> {
  const res = await githubApi(`/repos/${owner}/${repo}`, token);
  if (!res.ok) return "main";
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? "main";
}

async function getLatestCommitSha(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<string | null> {
  const res = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
  if (!res.ok) return null;
  const data = (await res.json()) as { object?: { sha?: string } };
  return data.object?.sha ?? null;
}

async function createTree(
  owner: string,
  repo: string,
  token: string,
  baseTreeSha: string | null,
  files: Array<{ path: string; content: string }>,
): Promise<string | null> {
  const tree = files.map((f) => ({
    path: f.path,
    mode: "100644" as const,
    type: "blob" as const,
    content: f.content,
  }));

  const res = await githubApi(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

async function createCommit(
  owner: string,
  repo: string,
  token: string,
  message: string,
  treeSha: string,
  parentSha: string | null,
): Promise<string | null> {
  const body: Record<string, unknown> = { message, tree: treeSha };
  if (parentSha) body.parents = [parentSha];

  const res = await githubApi(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

async function updateRef(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  sha: string,
): Promise<boolean> {
  const res = await githubApi(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha }),
  });
  return res.ok;
}

export async function POST(req: NextRequest): Promise<NextResponse<GitHubExportResult>> {
  try {
    const body = (await req.json()) as GitHubExportRequest;

    if (!body.githubToken || !body.repo || !body.soulContent) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "Missing required fields: githubToken, repo, soulContent" },
        { status: 400 },
      );
    }

    const [owner, repoName] = body.repo.split("/");
    if (!owner || !repoName) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "repo must be in 'owner/repo' format" },
        { status: 400 },
      );
    }

    // 1. Ensure repo exists
    const ensureResult = await ensureRepo(
      owner,
      repoName,
      body.githubToken,
      `${body.agentName} — AI agent template built with Ruh.ai`,
    );
    if (ensureResult.error) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: `Failed to create repo: ${ensureResult.error}` },
        { status: 502 },
      );
    }

    // 2. Get default branch and latest commit
    const branch = await getDefaultBranch(owner, repoName, body.githubToken);
    const parentSha = await getLatestCommitSha(owner, repoName, branch, body.githubToken);

    // If newly created repo, wait briefly for GitHub to initialize
    if (ensureResult.created && !parentSha) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    const finalParentSha = parentSha ?? await getLatestCommitSha(owner, repoName, branch, body.githubToken);

    // 3. Build file tree
    const files: Array<{ path: string; content: string }> = [
      { path: "SOUL.md", content: body.soulContent },
    ];

    for (const [filename, content] of Object.entries(body.skills)) {
      const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
      files.push({ path: `skills/${safeName}/SKILL.md`, content });
    }

    if (body.config) {
      for (const [filename, content] of Object.entries(body.config)) {
        files.push({ path: filename, content });
      }
    }

    // Add a README
    files.push({
      path: "README.md",
      content: [
        `# ${body.agentName}`,
        "",
        `> AI agent template built with [Ruh.ai](https://ruh.ai)`,
        "",
        "## Structure",
        "",
        "- `SOUL.md` — Agent personality, rules, and mission",
        "- `skills/` — Agent skills (one directory per skill)",
        "- `.openclaw/config.yml` — Runtime configuration",
        "",
        "## Deploy",
        "",
        "```bash",
        "openclaw deploy .",
        "```",
      ].join("\n"),
    });

    // 4. Create tree
    const baseTreeSha = finalParentSha
      ? await (async () => {
          const res = await githubApi(`/repos/${owner}/${repoName}/git/commits/${finalParentSha}`, body.githubToken);
          if (!res.ok) return null;
          const data = (await res.json()) as { tree?: { sha?: string } };
          return data.tree?.sha ?? null;
        })()
      : null;

    const treeSha = await createTree(owner, repoName, body.githubToken, baseTreeSha, files);
    if (!treeSha) {
      return NextResponse.json(
        { ok: false, repoUrl: `https://github.com/${owner}/${repoName}`, commitSha: null, filesPushed: 0, error: "Failed to create git tree" },
        { status: 502 },
      );
    }

    // 5. Create commit
    const commitMessage = body.commitMessage ?? `ship: ${body.agentName} agent template`;
    const commitSha = await createCommit(owner, repoName, body.githubToken, commitMessage, treeSha, finalParentSha);
    if (!commitSha) {
      return NextResponse.json(
        { ok: false, repoUrl: `https://github.com/${owner}/${repoName}`, commitSha: null, filesPushed: 0, error: "Failed to create commit" },
        { status: 502 },
      );
    }

    // 6. Update branch ref
    const updated = await updateRef(owner, repoName, branch, body.githubToken, commitSha);
    if (!updated) {
      return NextResponse.json(
        { ok: false, repoUrl: `https://github.com/${owner}/${repoName}`, commitSha, filesPushed: files.length, error: "Commit created but failed to update branch ref" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      commitSha,
      filesPushed: files.length,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: message },
      { status: 500 },
    );
  }
}
