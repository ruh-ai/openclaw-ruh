/**
 * POST /api/openclaw/github-export
 *
 * Exports an agent's workspace to a GitHub repository.
 * Takes a flat array of {path, content} files and pushes them all.
 *
 * Requires `gh` CLI installed and authenticated on the server.
 */

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

interface GitHubExportRequest {
  repo: string;
  agentName: string;
  /** V3: flat file array — preferred */
  files?: Array<{ path: string; content: string }>;
  /** V2 compat: SOUL.md content */
  soulContent?: string;
  /** V2 compat: skill files keyed by name */
  skills?: Record<string, string>;
  /** V2 compat: config files keyed by path */
  config?: Record<string, string>;
  commitMessage?: string;
}

interface GitHubExportResult {
  ok: boolean;
  repoUrl: string | null;
  commitSha: string | null;
  filesPushed: number;
  error: string | null;
}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function runSafe(cmd: string, cwd?: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: run(cmd, cwd) };
  } catch (err) {
    const message = err instanceof Error ? (err as Error & { stderr?: string }).stderr || err.message : String(err);
    return { ok: false, out: message };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<GitHubExportResult>> {
  let tempDir: string | null = null;

  try {
    const body = (await req.json()) as GitHubExportRequest;

    if (!body.repo) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "Missing required field: repo" },
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

    // Build file list — V3 (flat array) or V2 (soul + skills + config)
    let files: Array<{ path: string; content: string }>;

    if (body.files && body.files.length > 0) {
      // V3: use flat file array directly
      files = body.files;
    } else {
      // V2 compat: reconstruct from soul + skills + config
      files = [];
      if (body.soulContent) {
        files.push({ path: "SOUL.md", content: body.soulContent });
      }
      if (body.skills) {
        for (const [name, content] of Object.entries(body.skills)) {
          const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
          files.push({ path: `skills/${safeName}/SKILL.md`, content });
        }
      }
      if (body.config) {
        for (const [path, content] of Object.entries(body.config)) {
          files.push({ path, content });
        }
      }
      if (files.length === 0) {
        return NextResponse.json(
          { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "No files to push" },
          { status: 400 },
        );
      }
    }

    // Verify gh CLI
    const ghCheck = runSafe("gh auth status");
    if (!ghCheck.ok) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "gh CLI is not authenticated. Run `gh auth login` first." },
        { status: 500 },
      );
    }

    // Ensure repo exists
    const repoCheck = runSafe(`gh repo view ${owner}/${repoName} --json name`);
    if (!repoCheck.ok) {
      const create = runSafe(
        `gh repo create ${owner}/${repoName} --private --description "${body.agentName} — AI agent template built with Ruh.ai" --clone=false`,
      );
      if (!create.ok) {
        return NextResponse.json(
          { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: `Failed to create repo: ${create.out}` },
          { status: 502 },
        );
      }
    }

    // Clone repo into temp dir
    tempDir = mkdtempSync(join(tmpdir(), "ruh-export-"));
    // Remove the temp dir so gh clone can create it
    rmSync(tempDir, { recursive: true, force: true });

    const cloneResult = runSafe(`gh repo clone ${owner}/${repoName} "${tempDir}" -- --depth=1`);
    if (!cloneResult.ok) {
      // Empty repo — init fresh with gh auth
      mkdirSync(tempDir, { recursive: true });
      run(`git init "${tempDir}"`);
      runSafe("gh auth setup-git"); // Configure gh credential helper globally
      run(`git remote add origin https://github.com/${owner}/${repoName}.git`, tempDir);
      run("git checkout -b main", tempDir);
    }

    // Write ALL files
    for (const file of files) {
      const fullPath = join(tempDir, file.path);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      if (dir) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
    }

    // Commit and push
    run("git add -A", tempDir);

    const statusCheck = runSafe("git diff --cached --quiet", tempDir);
    if (statusCheck.ok) {
      return NextResponse.json({
        ok: true,
        repoUrl: `https://github.com/${owner}/${repoName}`,
        commitSha: null,
        filesPushed: 0,
        error: null,
      });
    }

    const commitMessage = body.commitMessage ?? `ship: ${body.agentName} agent template`;
    run(`git commit -m "${commitMessage}"`, tempDir);

    // Use gh CLI for push — it handles auth automatically
    const pushResult = runSafe(`gh repo sync --force --source "${tempDir}" 2>/dev/null || git push -u origin HEAD`, tempDir);
    if (!pushResult.ok) {
      // Fallback: configure gh credential helper and retry
      runSafe("gh auth setup-git", tempDir);
      const retryPush = runSafe("git push -u origin HEAD --force", tempDir);
      if (!retryPush.ok) {
        return NextResponse.json(
          { ok: false, repoUrl: `https://github.com/${owner}/${repoName}`, commitSha: null, filesPushed: files.length, error: `Push failed: ${retryPush.out}` },
          { status: 502 },
        );
      }
    }

    const commitSha = runSafe("git rev-parse HEAD", tempDir);

    return NextResponse.json({
      ok: true,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      commitSha: commitSha.ok ? commitSha.out : null,
      filesPushed: files.length,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: message },
      { status: 500 },
    );
  } finally {
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
}
