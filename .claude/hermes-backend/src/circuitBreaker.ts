import { query } from './db';
import { publish } from './eventBus';
import { circuit } from './logger';

const FAILURE_THRESHOLD = 3;      // consecutive failures to trip
const OPEN_DURATION_MS = 1800000; // 30 minutes in open state before half-open

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Record a success for an agent — resets consecutive failures, closes circuit.
 */
export async function recordSuccess(agentName: string): Promise<void> {
  await query(
    `UPDATE agents SET
      consecutive_failures = 0,
      circuit_state = 'closed',
      circuit_opened_at = NULL,
      updated_at = NOW()
     WHERE name = $1`,
    [agentName],
  );
}

/**
 * Record a failure for an agent — increments consecutive failures,
 * trips circuit to 'open' if threshold exceeded.
 */
export async function recordFailure(agentName: string): Promise<{ tripped: boolean; state: CircuitState }> {
  // Increment failures
  const result = await query(
    `UPDATE agents SET
      consecutive_failures = consecutive_failures + 1,
      updated_at = NOW()
     WHERE name = $1
     RETURNING consecutive_failures, circuit_state`,
    [agentName],
  );

  if (!result.rows[0]) return { tripped: false, state: 'closed' };

  const failures = Number(result.rows[0].consecutive_failures);
  const currentState = String(result.rows[0].circuit_state) as CircuitState;

  if (failures >= FAILURE_THRESHOLD && currentState === 'closed') {
    // Trip the circuit
    await query(
      `UPDATE agents SET circuit_state = 'open', circuit_opened_at = NOW() WHERE name = $1`,
      [agentName],
    );

    circuit.warn({ agentName, consecutiveFailures: failures }, 'TRIPPED — paused for 30min');
    publish({ type: 'refinement', action: 'created', data: {
      type: 'circuit-breaker-tripped',
      agentName,
      consecutiveFailures: failures,
    }});

    return { tripped: true, state: 'open' };
  }

  return { tripped: false, state: currentState };
}

/**
 * Check if an agent is available (circuit closed or half-open).
 * Auto-transitions from open → half-open after OPEN_DURATION_MS.
 */
export async function isAgentAvailable(agentName: string): Promise<{ available: boolean; state: CircuitState; reason?: string }> {
  const result = await query(
    `SELECT circuit_state, circuit_opened_at, consecutive_failures FROM agents WHERE name = $1`,
    [agentName],
  );

  if (!result.rows[0]) return { available: true, state: 'closed' };

  const state = String(result.rows[0].circuit_state) as CircuitState;
  const openedAt = result.rows[0].circuit_opened_at;
  const failures = Number(result.rows[0].consecutive_failures);

  if (state === 'closed') {
    return { available: true, state: 'closed' };
  }

  if (state === 'open' && openedAt) {
    const elapsed = Date.now() - new Date(String(openedAt)).getTime();
    if (elapsed >= OPEN_DURATION_MS) {
      // Transition to half-open — allow one probe task
      await query(
        `UPDATE agents SET circuit_state = 'half-open', updated_at = NOW() WHERE name = $1`,
        [agentName],
      );
      circuit.info({ agentName, elapsedMin: Math.round(elapsed / 60000) }, 'Transitioned to half-open');
      return { available: true, state: 'half-open' };
    }

    const remainingMin = Math.round((OPEN_DURATION_MS - elapsed) / 60000);
    return {
      available: false,
      state: 'open',
      reason: `Circuit open: ${failures} consecutive failures. Available in ~${remainingMin}min`,
    };
  }

  // half-open — allow one task through as a probe
  return { available: true, state: 'half-open' };
}
