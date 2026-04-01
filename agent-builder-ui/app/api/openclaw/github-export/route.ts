/**
 * POST /api/openclaw/github-export
 *
 * Exports an agent's workspace template to a GitHub repository
 * using the locally authenticated `gh` CLI instead of a user-provided PAT.
 *
 * Requires `gh` CLI installed and authenticated on the server.
 */

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

interface GitHubExportRequest {
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

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
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

    if (!body.repo || !body.soulContent) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "Missing required fields: repo, soulContent" },
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

    // Verify gh CLI is available and authenticated
    const ghCheck = runSafe("gh auth status");
    if (!ghCheck.ok) {
      return NextResponse.json(
        { ok: false, repoUrl: null, commitSha: null, filesPushed: 0, error: "gh CLI is not authenticated. Run `gh auth login` first." },
        { status: 500 },
      );
    }

    // 1. Ensure repo exists (create if not)
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

    // 2. Clone the repo (or init if empty)
    tempDir = mkdtempSync(join(tmpdir(), "ruh-agent-export-"));
    const cloneResult = runSafe(`gh repo clone ${owner}/${repoName} "${tempDir}" -- --depth=1`);

    if (!cloneResult.ok) {
      // Repo might be empty (no commits yet) — init manually
      run(`git init "${tempDir}"`);
      run(`git remote add origin https://github.com/${owner}/${repoName}.git`, tempDir);
      run("git checkout -b main", tempDir);
    }

    // 3. Write agent files
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

    // Auto-generated README
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

    // Write all files to the temp directory
    for (const file of files) {
      const fullPath = join(tempDir, file.path);
      const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, file.content, "utf-8");
    }

    // 4. Git add, commit, push
    run("git add -A", tempDir);

    const statusCheck = runSafe("git diff --cached --quiet", tempDir);
    if (statusCheck.ok) {
      // Nothing changed — still return success
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

    // Push using gh-authenticated git
    const pushResult = runSafe("git push -u origin HEAD", tempDir);
    if (!pushResult.ok) {
      return NextResponse.json(
        { ok: false, repoUrl: `https://github.com/${owner}/${repoName}`, commitSha: null, filesPushed: files.length, error: `Push failed: ${pushResult.out}` },
        { status: 502 },
      );
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
    // Cleanup temp directory
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
