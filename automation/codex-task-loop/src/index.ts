import { hostname } from "node:os";

import { executeCodex } from "./codex.js";
import { loadConfig } from "./config.js";
import { dispatchTick } from "./dispatcher.js";
import { buildBranchName, GitPrClient } from "./git-pr.js";
import { LeaseStore } from "./lease-store.js";
import { LinearClient } from "./linear.js";
import { Logger } from "./logger.js";
import { buildTaskPrompt } from "./prompt.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const leaseStore = new LeaseStore(config.stateDir);
  const linearClient = new LinearClient({
    repoPath: config.repoPath,
    projectName: config.projectName,
    labelName: config.codexLabel,
    buildPlanPath: config.buildPlanPath,
    dryRun: config.dryRun,
    apiKey: config.linearApiKey,
  });
  const gitPrClient = new GitPrClient({
    repoPath: config.repoPath,
    baseBranch: config.baseBranch,
    dryRun: config.dryRun,
  });
  const host = hostname();
  const activeLease = await leaseStore.read();

  logger.info("codex task loop runner initialized", {
    repoPath: config.repoPath,
    stateDir: config.stateDir,
    dryRun: config.dryRun,
    model: config.model,
    buildPlanPath: config.buildPlanPath,
    hasActiveLease: activeLease !== null,
  });

  const result = await dispatchTick({
    now: new Date().toISOString(),
    leaseStore,
    linearAdapter: linearClient,
    codexExecutor: async (issue) => {
      const branchName = buildBranchName(issue.id, issue.title);
      logger.info("executing codex task", {
        issueId: issue.id,
        branchName,
      });

      return executeCodex({
        model: config.model,
        cwd: config.repoPath,
        prompt: buildTaskPrompt({
          issueId: issue.id,
          title: issue.title,
          description: issue.description,
          branchName,
          verificationCommands: config.verificationCommands,
        }),
        timeoutMs: config.codexTimeoutMs,
      });
    },
    gitPrAdapter: gitPrClient,
    branchFactory: (issue) => buildBranchName(issue.id, issue.title),
    runIdFactory: () => `run-${Date.now()}`,
    hostname: host,
    maxRetries: config.maxRetries,
  });

  logger.info("dispatcher tick complete", result);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", message }));
  process.exitCode = 1;
});
