import { describe, expect, test } from 'bun:test';

import {
  buildSandboxRuntimeReconciliation,
  classifySandboxRuntime,
  type ManagedSandboxContainer,
} from '../../src/sandboxRuntime';
import { makeSandboxRecord } from '../helpers/fixtures';

describe('classifySandboxRuntime', () => {
  test('classifies a DB-backed sandbox with no container as db_only', () => {
    const record = makeSandboxRecord();

    expect(classifySandboxRuntime({ record, container: null, gatewayReachable: false })).toMatchObject({
      sandbox_id: record.sandbox_id,
      drift_state: 'db_only',
      sandbox_exists: true,
      container_exists: false,
      container_running: false,
    });
  });

  test('classifies a running container with an unreachable gateway as gateway_unreachable', () => {
    const record = makeSandboxRecord();
    const container: ManagedSandboxContainer = {
      sandbox_id: record.sandbox_id,
      container_name: `openclaw-${record.sandbox_id}`,
      state: 'running',
      running: true,
      status: 'Up 2 minutes',
    };

    expect(classifySandboxRuntime({ record, container, gatewayReachable: false })).toMatchObject({
      sandbox_id: record.sandbox_id,
      drift_state: 'gateway_unreachable',
      sandbox_exists: true,
      container_exists: true,
      container_running: true,
    });
  });
});

describe('buildSandboxRuntimeReconciliation', () => {
  test('includes DB-only and container-only entries in one report', () => {
    const dbRecord = makeSandboxRecord({ sandbox_id: 'sb-db-only', sandbox_name: 'DB Only' });
    const healthyRecord = makeSandboxRecord({ sandbox_id: 'sb-healthy', sandbox_name: 'Healthy' });
    const containers: ManagedSandboxContainer[] = [
      {
        sandbox_id: 'sb-healthy',
        container_name: 'openclaw-sb-healthy',
        state: 'running',
        running: true,
        status: 'Up 5 minutes',
      },
      {
        sandbox_id: 'sb-container-only',
        container_name: 'openclaw-sb-container-only',
        state: 'exited',
        running: false,
        status: 'Exited (0) 2 minutes ago',
      },
    ];

    const report = buildSandboxRuntimeReconciliation({
      records: [dbRecord, healthyRecord],
      containers,
      gatewayReachableBySandboxId: {
        'sb-healthy': true,
      },
    });

    expect(report.summary).toEqual({
      total: 3,
      healthy: 1,
      gateway_unreachable: 0,
      db_only: 1,
      container_only: 1,
      missing: 0,
    });
    expect(report.items.map((item) => [item.sandbox_id, item.drift_state])).toEqual([
      ['sb-db-only', 'db_only'],
      ['sb-healthy', 'healthy'],
      ['sb-container-only', 'container_only'],
    ]);
  });
});
