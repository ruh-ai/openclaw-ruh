/**
 * workspaceGitPush.ts — Push the sandbox workspace to GitHub directly.
 *
 * Runs git commands inside the container where the workspace lives.
 * No file copying, no temp dirs, no protocol translation.
 * The workspace IS the repo.
 */

import { dockerExec, getContainerName } from './docker';

export interface GitPushOptions {
  sandboxId: string;
  repoUrl: string;           // "owner/repo" or full https URL
  githubToken?: string;      // PAT for private repos (optional if gh is authed)
  commitMessage?: string;
  agentName?: string;
  onLog?: (message: string) => void;
}

export interface GitPushResult {
  ok: boolean;
  repoUrl: string;
  commitSha: string | null;
  filesPushed: number;
  error: string | null;
}

/**
 * Push the workspace to GitHub directly from inside the sandbox container.
 */
export async function pushWorkspaceToGitHub(opts: GitPushOptions): Promise<GitPushResult> {
  const containerName = getContainerName(opts.sandboxId);
  const log = opts.onLog ?? (() => {});

  // Normalize repo URL
  let repoSlug = opts.repoUrl;
  if (repoSlug.startsWith("https://github.com/")) {
    repoSlug = repoSlug.replace("https://github.com/", "").replace(/\.git$/, "");
  }
  // Use x-access-token format — works with all GitHub token types (PAT, OAuth, app)
  let httpsUrl = opts.githubToken
    ? `https://x-access-token:${opts.githubToken}@github.com/${repoSlug}.git`
    : `https://github.com/${repoSlug}.git`;

  const commitMessage = opts.commitMessage ?? `ship: ${opts.agentName ?? "agent"} template`;

  try {
    console.log(`[git-push] Called: sandbox=${opts.sandboxId} repo=${repoSlug} token=${opts.githubToken ? `${opts.githubToken.slice(0,4)}...${opts.githubToken.slice(-4)}` : 'NONE'}`);

    // 1. Ensure git is installed
    log("Checking git...");
    const [gitOk] = await dockerExec(containerName, 'which git || (apt-get update -qq && apt-get install -y --no-install-recommends git >/dev/null 2>&1 && echo OK)', 60_000);
    if (!gitOk) {
      return { ok: false, repoUrl: `https://github.com/${repoSlug}`, commitSha: null, filesPushed: 0, error: "Failed to install git" };
    }

    // 1b. Create the GitHub repo if it doesn't exist
    // Runs on the backend directly (not docker exec) to avoid shell escaping issues
    if (opts.githubToken) {
      const [owner, repoName] = repoSlug.split("/");
      if (owner && repoName) {
        log("Checking if GitHub repo exists...");
        const checkRes = await fetch(`https://api.github.com/repos/${repoSlug}`, {
          headers: { Authorization: `token ${opts.githubToken}`, Accept: "application/json" },
        });

        console.log(`[git-push] Repo check: ${checkRes.status} for ${repoSlug}`);
        if (checkRes.status === 404) {
          log(`Creating repo ${repoSlug}...`);

          // Try creating under the authenticated user
          const userCreateRes = await fetch("https://api.github.com/user/repos", {
            method: "POST",
            headers: {
              Authorization: `token ${opts.githubToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              name: repoName,
              private: true,
              description: `${opts.agentName ?? "Agent"} — built with Ruh.ai`,
              auto_init: false,
            }),
          });

          console.log(`[git-push] User repo create: ${userCreateRes.status}`);
          if (userCreateRes.status === 201) {
            const created = await userCreateRes.json() as { full_name?: string };
            if (created.full_name) {
              repoSlug = created.full_name;
              log(`Repo created: ${repoSlug}`);
            }
          } else {
            const errText = await userCreateRes.text().catch(() => "");
            console.log(`[git-push] User repo create failed: ${errText.slice(0, 200)}`);
            // Try creating under org
            const orgCreateRes = await fetch(`https://api.github.com/orgs/${owner}/repos`, {
              method: "POST",
              headers: {
                Authorization: `token ${opts.githubToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                name: repoName,
                private: true,
                description: `${opts.agentName ?? "Agent"} — built with Ruh.ai`,
                auto_init: false,
              }),
            });

            if (orgCreateRes.status === 201) {
              const created = await orgCreateRes.json() as { full_name?: string };
              if (created.full_name) {
                repoSlug = created.full_name;
                log(`Repo created under org: ${repoSlug}`);
              }
            } else {
              const errBody = await orgCreateRes.text().catch(() => "");
              return {
                ok: false,
                repoUrl: `https://github.com/${repoSlug}`,
                commitSha: null,
                filesPushed: 0,
                error: `Failed to create repo. Ensure your token has 'repo' scope. GitHub said: ${errBody.slice(0, 200)}`,
              };
            }
          }
        }
      }

      // Rebuild push URL with the (possibly updated) repo slug
      httpsUrl = `https://x-access-token:${opts.githubToken}@github.com/${repoSlug}.git`;
    }

    // 2. Init git repo in workspace (idempotent)
    log("Initializing git...");
    await dockerExec(containerName, [
      'cd ~/.openclaw/workspace',
      'git init 2>/dev/null',
      'git config user.email "agent@ruh.ai"',
      'git config user.name "Ruh Agent Builder"',
    ].join(' && '), 10_000);

    // 3. Ensure .gitignore exists and is committed FIRST so git add -A respects it
    log("Setting up .gitignore...");
    await dockerExec(containerName, [
      'cd ~/.openclaw/workspace',
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
      'git add .gitignore',
      'git diff --cached --quiet .gitignore 2>/dev/null || git commit -m "chore: add .gitignore" --allow-empty 2>/dev/null',
    ].join(' && '), 10_000);

    // 4. Remove node_modules from git tracking if previously added
    await dockerExec(containerName, [
      'cd ~/.openclaw/workspace',
      'git rm -r --cached node_modules 2>/dev/null || true',
    ].join(' && '), 15_000);

    // 5. Stage all files (respects .gitignore now)
    log("Staging files...");
    const [, countOutput] = await dockerExec(containerName, [
      'cd ~/.openclaw/workspace',
      'git add -A',
      'git status --porcelain | wc -l',
    ].join(' && '), 15_000);
    const fileCount = parseInt(countOutput.trim(), 10) || 0;

    if (fileCount === 0) {
      return { ok: true, repoUrl: `https://github.com/${repoSlug}`, commitSha: null, filesPushed: 0, error: null };
    }

    // 5. Commit
    log(`Committing ${fileCount} files...`);
    await dockerExec(containerName, [
      'cd ~/.openclaw/workspace',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}" --allow-empty`,
    ].join(' && '), 15_000);

    // 6. Set remote and push
    log("Pushing to GitHub...");
    const [pushOk, pushOutput] = await dockerExec(containerName, [
      'cd ~/.openclaw/workspace',
      `git remote remove origin 2>/dev/null; git remote add origin '${httpsUrl}'`,
      'git branch -M main',
      'git push -u origin main --force 2>&1',
    ].join(' && '), 60_000);

    if (!pushOk) {
      return {
        ok: false,
        repoUrl: `https://github.com/${repoSlug}`,
        commitSha: null,
        filesPushed: fileCount,
        error: `Push failed: ${pushOutput.slice(0, 300)}`,
      };
    }

    // 7. Get commit SHA
    const [, sha] = await dockerExec(containerName, 'cd ~/.openclaw/workspace && git rev-parse HEAD', 5_000);

    // Extract actual repo URL from the remote (in case slug was updated during create)
    const [, remoteUrl] = await dockerExec(containerName, 'cd ~/.openclaw/workspace && git remote get-url origin 2>/dev/null', 5_000);
    const actualSlug = remoteUrl.replace(/.*github\.com[:/]/, "").replace(/\.git$/, "").replace(/x-access-token:[^@]*@/, "").trim();
    const finalRepoUrl = actualSlug ? `https://github.com/${actualSlug}` : `https://github.com/${repoSlug}`;

    log(`Pushed ${fileCount} files to ${finalRepoUrl}`);
    return {
      ok: true,
      repoUrl: finalRepoUrl,
      commitSha: sha.trim() || null,
      filesPushed: fileCount,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      repoUrl: `https://github.com/${repoSlug}`,
      commitSha: null,
      filesPushed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
