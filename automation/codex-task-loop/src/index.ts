import { loadConfig } from "./config.js";
import { LeaseStore } from "./lease-store.js";
import { Logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const leaseStore = new LeaseStore(config.stateDir);

  logger.info("codex task loop runner initialized", {
    repoPath: config.repoPath,
    stateDir: config.stateDir,
    dryRun: config.dryRun,
    hasActiveLease: (await leaseStore.read()) !== null,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", message }));
  process.exitCode = 1;
});
