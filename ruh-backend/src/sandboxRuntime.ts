// @kb: 003-sandbox-lifecycle 005-data-models
import type { SandboxRecord } from './store';
import type { ManagedSandboxContainer } from './docker';

export type SandboxDriftState =
  | 'healthy'
  | 'gateway_unreachable'
  | 'db_only'
  | 'container_only'
  | 'missing';

export interface ReconciledSandboxRuntime {
  sandbox_id: string;
  sandbox_name: string | null;
  sandbox_exists: boolean;
  container_exists: boolean;
  container_name: string | null;
  container_running: boolean;
  container_state: string | null;
  container_status: string | null;
  gateway_reachable: boolean;
  drift_state: SandboxDriftState;
  created_at: string | null;
}

export interface SandboxRuntimeReport {
  summary: Record<SandboxDriftState | 'total', number>;
  items: ReconciledSandboxRuntime[];
}

export function classifySandboxRuntime(input: {
  record: SandboxRecord | null;
  container: ManagedSandboxContainer | null;
  gatewayReachable: boolean;
}): ReconciledSandboxRuntime {
  const { record, container, gatewayReachable } = input;
  const sandbox_id = record?.sandbox_id ?? container?.sandbox_id ?? '';
  const container_exists = Boolean(container);
  const container_running = Boolean(container?.running);

  let drift_state: SandboxDriftState = 'missing';
  if (record && container_running && gatewayReachable) {
    drift_state = 'healthy';
  } else if (record && container_exists) {
    drift_state = 'gateway_unreachable';
  } else if (record) {
    drift_state = 'db_only';
  } else if (container) {
    drift_state = 'container_only';
  }

  return {
    sandbox_id,
    sandbox_name: record?.sandbox_name ?? null,
    sandbox_exists: Boolean(record),
    container_exists,
    container_name: container?.container_name ?? null,
    container_running,
    container_state: container?.state ?? null,
    container_status: container?.status ?? null,
    gateway_reachable: gatewayReachable,
    drift_state,
    created_at: record?.created_at ?? null,
  };
}

export function buildSandboxRuntimeReconciliation(input: {
  records: SandboxRecord[];
  containers: ManagedSandboxContainer[];
  gatewayReachableBySandboxId?: Record<string, boolean>;
}): SandboxRuntimeReport {
  const { records, containers, gatewayReachableBySandboxId = {} } = input;
  const recordById = new Map(records.map((record) => [record.sandbox_id, record]));
  const containerById = new Map(containers.map((container) => [container.sandbox_id, container]));
  const sandboxIds = new Set<string>([
    ...recordById.keys(),
    ...containerById.keys(),
  ]);

  const items = Array.from(sandboxIds)
    .map((sandbox_id) => classifySandboxRuntime({
      record: recordById.get(sandbox_id) ?? null,
      container: containerById.get(sandbox_id) ?? null,
      gatewayReachable: Boolean(gatewayReachableBySandboxId[sandbox_id]),
    }))
    .sort((left, right) => {
      if (left.sandbox_exists !== right.sandbox_exists) {
        return left.sandbox_exists ? -1 : 1;
      }
      if (left.created_at && right.created_at) {
        return left.created_at.localeCompare(right.created_at);
      }
      return left.sandbox_id.localeCompare(right.sandbox_id);
    });

  const summary = {
    total: items.length,
    healthy: 0,
    gateway_unreachable: 0,
    db_only: 0,
    container_only: 0,
    missing: 0,
  };

  for (const item of items) {
    summary[item.drift_state] += 1;
  }

  return { summary, items };
}
