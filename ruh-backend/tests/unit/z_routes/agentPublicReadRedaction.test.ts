/**
 * agentStore credential redaction tests have been consolidated into
 * tests/unit/stores/agentStore.test.ts to avoid test-order pollution
 * caused by other z_routes test files mocking the agentStore module.
 *
 * These tests verify that agentStore.listAgents() and agentStore.getAgent()
 * strip stored credential envelopes from the public agent payload.
 *
 * See: tests/unit/stores/agentStore.test.ts — "agentStore public reads"
 */

import { describe, test } from 'bun:test';

describe('agentStore public reads (redaction)', () => {
  test('tests live in tests/unit/stores/agentStore.test.ts', () => {
    // Intentionally empty — see module docstring above.
  });
});
