"use client";

import { useState, useCallback } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Rocket,
  Github,
} from "lucide-react";
import { createWorkspaceApiUrl } from "@/lib/openclaw/files-workspace";

interface ShipDialogProps {
  sandboxId: string;
  agentName: string;
  onClose: () => void;
}

type ShipStep = "form" | "reading" | "pushing" | "done" | "error";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function ShipDialog({ sandboxId, agentName, onClose }: ShipDialogProps) {
  const [githubToken, setGithubToken] = useState("");
  const [repo, setRepo] = useState("");
  const [step, setStep] = useState<ShipStep>("form");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  const handleShip = useCallback(async () => {
    if (!githubToken.trim() || !repo.trim()) return;
    setStep("reading");
    setStatusMsg("Reading workspace files...");
    setErrorMsg("");

    try {
      // 1. List workspace files
      const listUrl = new URL(createWorkspaceApiUrl(API_BASE, sandboxId, "files"));
      listUrl.searchParams.set("depth", "4");
      listUrl.searchParams.set("limit", "200");
      const listRes = await fetch(listUrl.toString());
      if (!listRes.ok) throw new Error("Failed to list workspace files");
      const listData = await listRes.json();
      const items: Array<{ path: string; name: string; type: string; preview_kind?: string }> =
        listData.items ?? [];

      const textFiles = items.filter(
        (i) => i.type === "file" && (i.preview_kind === "text" || !i.preview_kind),
      );

      if (textFiles.length === 0) throw new Error("Workspace is empty — nothing to ship");

      // 2. Read each file
      setStatusMsg(`Reading ${textFiles.length} files...`);
      const fileContents: Array<{ path: string; content: string }> = [];
      for (const file of textFiles) {
        const readUrl = createWorkspaceApiUrl(API_BASE, sandboxId, "file", file.path);
        const readRes = await fetch(readUrl);
        if (!readRes.ok) continue;
        const readData = await readRes.json();
        if (readData.content) {
          fileContents.push({ path: file.path, content: readData.content });
        }
      }

      if (fileContents.length === 0) throw new Error("No readable files in workspace");

      // 3. Separate into SOUL, skills, config, and other files
      const soulFile = fileContents.find((f) => f.path === "SOUL.md" || f.path.endsWith("/SOUL.md"));
      const soulContent = soulFile?.content ?? `# ${agentName}\n\nAgent template.\n`;

      const skills: Record<string, string> = {};
      const config: Record<string, string> = {};

      for (const file of fileContents) {
        if (file.path === soulFile?.path) continue;
        if (file.path.startsWith("skills/")) {
          const skillKey = file.path.replace(/^skills\//, "").replace(/\/SKILL\.md$/, "");
          if (file.path.endsWith("SKILL.md")) {
            skills[skillKey] = file.content;
          } else {
            config[file.path] = file.content;
          }
        } else {
          config[file.path] = file.content;
        }
      }

      // 4. Push to GitHub
      setStep("pushing");
      setStatusMsg("Pushing to GitHub...");

      const exportRes = await fetch("/api/openclaw/github-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubToken: githubToken.trim(),
          repo: repo.trim(),
          agentName,
          soulContent,
          skills,
          config,
          commitMessage: `ship: ${agentName} agent template`,
        }),
      });

      const result = await exportRes.json();
      if (!result.ok) throw new Error(result.error ?? "GitHub export failed");

      setRepoUrl(result.repoUrl);
      setStep("done");
      setStatusMsg(`Shipped ${result.filesPushed} files`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Ship failed");
      setStep("error");
    }
  }, [githubToken, repo, sandboxId, agentName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-stroke)] bg-[var(--card-color)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-stroke)]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[var(--primary)]/10">
              <Rocket className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                Ship to GitHub
              </h2>
              <p className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)]">
                Push {agentName}&apos;s workspace as a template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-light)] transition-colors"
          >
            <X className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {step === "form" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="focus-breathe w-full px-3 py-2 text-sm font-satoshi-regular rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none transition-colors"
                />
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  Needs <code className="text-[var(--primary)]">repo</code> scope
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-satoshi-medium text-[var(--text-secondary)]">
                  Repository
                </label>
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                  <input
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="owner/repo-name"
                    className="focus-breathe flex-1 px-3 py-2 text-sm font-satoshi-regular rounded-xl border border-[var(--border-stroke)] bg-[var(--background)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none transition-colors"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  Will be created as a private repo if it doesn&apos;t exist
                </p>
              </div>
            </>
          )}

          {(step === "reading" || step === "pushing") && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div
                className="soul-orb rounded-full flex items-center justify-center"
                style={{
                  width: "64px",
                  height: "64px",
                  background: "radial-gradient(circle, rgba(174, 0, 208, 0.1) 0%, rgba(123, 90, 255, 0.05) 50%, transparent 70%)",
                }}
              >
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: "36px",
                    height: "36px",
                    background: "linear-gradient(135deg, #ae00d0, #7b5aff)",
                  }}
                >
                  <Rocket className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-sm font-satoshi-medium text-[var(--text-primary)]">
                {statusMsg}
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center py-8 gap-4">
              {/* Soul born celebration — THE moment */}
              <div className="soul-born rounded-full flex items-center justify-center"
                style={{
                  width: "72px",
                  height: "72px",
                  background: "radial-gradient(circle, rgba(174, 0, 208, 0.1) 0%, rgba(123, 90, 255, 0.06) 50%, transparent 70%)",
                }}
              >
                <div
                  className="soul-pulse-strong rounded-full flex items-center justify-center"
                  style={{
                    width: "52px",
                    height: "52px",
                    background: "linear-gradient(135deg, #ae00d0, #7b5aff)",
                  }}
                >
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="text-center space-y-1 spark">
                <p className="text-lg font-satoshi-bold text-[var(--text-primary)]">
                  {agentName} is alive
                </p>
                <p className="text-xs font-satoshi-regular text-[var(--text-secondary)]">
                  {statusMsg} to GitHub
                </p>
              </div>
              {repoUrl && (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gradient-drift flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-satoshi-bold hover:opacity-90 transition-opacity"
                >
                  <Github className="h-4 w-4" />
                  View on GitHub
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-50">
                <AlertCircle className="h-6 w-6 text-[var(--error)]" />
              </div>
              <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                Ship failed
              </p>
              <p className="text-xs font-satoshi-regular text-[var(--error)] text-center">
                {errorMsg}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-stroke)]">
          {step === "form" && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleShip}
                disabled={!githubToken.trim() || !repo.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Rocket className="h-3.5 w-3.5" />
                Ship
              </button>
            </>
          )}
          {step === "error" && (
            <>
              <button
                onClick={() => setStep("form")}
                className="px-4 py-2 text-sm font-satoshi-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--color-light)] transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90 transition-all"
              >
                Close
              </button>
            </>
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-satoshi-bold text-white rounded-xl bg-[var(--primary)] hover:opacity-90 transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
