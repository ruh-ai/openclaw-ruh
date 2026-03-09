import type { CodexOutcome } from "./codex.js";
import type { TaskLease } from "./lease-store.js";
import { formatLeaseComment, type LinearIssueSummary, type LoopIssueState } from "./linear.js";
import { selectTask } from "./task-selector.js";

export interface LeaseStoreAdapter {
  read(): Promise<TaskLease | null>;
  write(value: TaskLease): Promise<void>;
  renew(heartbeatAt: string): Promise<void>;
  release(): Promise<void>;
}

export interface LinearAdapter {
  listEligibleIssues(): Promise<LinearIssueSummary[]>;
  transitionIssue(issueId: string, state: LoopIssueState): Promise<void>;
  commentOnIssue(issueId: string, body: string): Promise<void>;
}

export interface GitPrAdapter {
  openOrUpdatePullRequest(issue: LinearIssueSummary, outcome: CodexOutcome): Promise<string | null>;
  findMergedPullRequest(issueId: string): Promise<boolean>;
}

export interface DispatchTickInput {
  now: string;
  leaseStore: LeaseStoreAdapter;
  linearAdapter: LinearAdapter;
  codexExecutor: (issue: LinearIssueSummary) => Promise<CodexOutcome>;
  gitPrAdapter: GitPrAdapter;
  branchFactory: (issue: LinearIssueSummary) => string;
  runIdFactory: () => string;
  hostname: string;
  maxRetries?: number;
}

export interface DispatchTickResult {
  status: "idle" | "started" | "in_review" | "done" | "blocked";
  issueId?: string;
}

export async function dispatchTick(input: DispatchTickInput): Promise<DispatchTickResult> {
  const issues = await input.linearAdapter.listEligibleIssues();
  const activeLease = await input.leaseStore.read();

  if (activeLease) {
    const leasedIssue = issues.find((issue) => issue.id === activeLease.issueId);
    if (!leasedIssue) {
      return { status: "idle" };
    }

    if (await input.gitPrAdapter.findMergedPullRequest(leasedIssue.id)) {
      await input.linearAdapter.transitionIssue(leasedIssue.id, "Done");
      await input.leaseStore.release();
      return { status: "done", issueId: leasedIssue.id };
    }

    const outcome = await input.codexExecutor(leasedIssue);
    if (outcome.status === "completed") {
      const prUrl = await input.gitPrAdapter.openOrUpdatePullRequest(leasedIssue, outcome);
      if (prUrl) {
        await input.linearAdapter.transitionIssue(leasedIssue.id, "In Review");
        await input.linearAdapter.commentOnIssue(leasedIssue.id, `PR ready: ${prUrl}`);
        return { status: "in_review", issueId: leasedIssue.id };
      }
    }

    if (outcome.status === "blocked") {
      await input.linearAdapter.transitionIssue(leasedIssue.id, "Blocked");
      await input.linearAdapter.commentOnIssue(leasedIssue.id, outcome.summary);
      await input.leaseStore.release();
      return { status: "blocked", issueId: leasedIssue.id };
    }

    if (outcome.status === "retryable_failure" && activeLease.retryCount >= (input.maxRetries ?? 2)) {
      await input.linearAdapter.transitionIssue(leasedIssue.id, "Blocked");
      await input.linearAdapter.commentOnIssue(leasedIssue.id, outcome.summary);
      await input.leaseStore.release();
      return { status: "blocked", issueId: leasedIssue.id };
    }

    if (outcome.status === "retryable_failure") {
      await input.leaseStore.write({
        ...activeLease,
        heartbeatAt: input.now,
        retryCount: activeLease.retryCount + 1,
      });
      return { status: "started", issueId: leasedIssue.id };
    }

    await input.leaseStore.renew(input.now);
    return { status: "started", issueId: leasedIssue.id };
  }

  const selectedIssue = selectTask({ issues });
  if (!selectedIssue) {
    return { status: "idle" };
  }

  const newLease: TaskLease = {
    issueId: selectedIssue.id,
    branchName: input.branchFactory(selectedIssue),
    runId: input.runIdFactory(),
    hostname: input.hostname,
    startedAt: input.now,
    heartbeatAt: input.now,
    retryCount: 0,
  };

  await input.linearAdapter.transitionIssue(selectedIssue.id, "Started");
  await input.linearAdapter.commentOnIssue(
    selectedIssue.id,
    formatLeaseComment({
      issueId: selectedIssue.id,
      branchName: newLease.branchName,
      runId: newLease.runId,
      hostname: newLease.hostname,
      startedAt: newLease.startedAt,
    }),
  );
  await input.leaseStore.write(newLease);

  return { status: "started", issueId: selectedIssue.id };
}
