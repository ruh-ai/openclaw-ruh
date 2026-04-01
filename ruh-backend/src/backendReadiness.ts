export type BackendReadinessStatus = 'ready' | 'not_ready';

export interface BackendReadinessSnapshot {
  status: BackendReadinessStatus;
  ready: boolean;
  reason: string | null;
}

const DEFAULT_NOT_READY_REASON = 'Waiting for database initialization';

let ready = false;
let reason: string | null = DEFAULT_NOT_READY_REASON;

export function getBackendReadiness(): BackendReadinessSnapshot {
  return {
    status: ready ? 'ready' : 'not_ready',
    ready,
    reason,
  };
}

export function markBackendReady(): void {
  ready = true;
  reason = null;
}

export function markBackendNotReady(nextReason = DEFAULT_NOT_READY_REASON): void {
  ready = false;
  reason = nextReason;
}
