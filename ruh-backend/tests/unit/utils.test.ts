import { describe, expect, test } from 'bun:test';
import { httpError, gatewayUrlAndHeaders, parseJsonOutput, syntheticModels } from '../../src/utils';
import type { SandboxRecord } from '../../src/store';

// ── httpError ────────────────────────────────────────────────────────────────

describe('httpError', () => {
  test('attaches status to error', () => {
    const err = httpError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  test('works for 500', () => {
    const err = httpError(500, 'Internal error');
    expect(err.status).toBe(500);
  });

  test('works for 400', () => {
    const err = httpError(400, 'Bad request');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Bad request');
  });
});

// ── gatewayUrlAndHeaders ─────────────────────────────────────────────────────

function makeRecord(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    sandbox_id: 'sb-001',
    sandbox_name: 'test',
    sandbox_state: 'started',
    dashboard_url: null,
    signed_url: null,
    standard_url: null,
    preview_token: null,
    gateway_token: null,
    gateway_port: 18789,
    ssh_command: '',
    created_at: new Date().toISOString(),
    approved: false,
    ...overrides,
  };
}

describe('gatewayUrlAndHeaders', () => {
  test('throws 503 when no URL is available', () => {
    const rec = makeRecord();
    expect(() => gatewayUrlAndHeaders(rec, '/v1/models')).toThrow('No gateway URL available');
  });

  test('uses signed_url first when available', () => {
    const rec = makeRecord({
      signed_url: 'https://signed.example.com/',
      standard_url: 'https://standard.example.com',
      gateway_token: 'tok123',
      preview_token: 'prev-tok',
    });
    const [url, headers] = gatewayUrlAndHeaders(rec, '/v1/models');
    expect(url).toBe('https://signed.example.com/v1/models');
    // signed_url present → no preview token header
    expect(headers['X-Daytona-Preview-Token']).toBeUndefined();
    // gateway token still set
    expect(headers['Authorization']).toBe('Bearer tok123');
  });

  test('uses standard_url when no signed_url', () => {
    const rec = makeRecord({ standard_url: 'https://standard.example.com' });
    const [url] = gatewayUrlAndHeaders(rec, '/api/status');
    expect(url).toBe('https://standard.example.com/api/status');
  });

  test('falls back to dashboard_url', () => {
    const rec = makeRecord({ dashboard_url: 'https://dash.example.com' });
    const [url] = gatewayUrlAndHeaders(rec, '/v1/chat/completions');
    expect(url).toBe('https://dash.example.com/v1/chat/completions');
  });

  test('adds preview token header when no signed_url but token present', () => {
    const rec = makeRecord({
      standard_url: 'https://standard.example.com',
      preview_token: 'my-prev-tok',
    });
    const [, headers] = gatewayUrlAndHeaders(rec, '/v1/models');
    expect(headers['X-Daytona-Preview-Token']).toBe('my-prev-tok');
  });

  test('strips trailing slash from base URL', () => {
    const rec = makeRecord({ standard_url: 'https://example.com/' });
    const [url] = gatewayUrlAndHeaders(rec, '/v1/models');
    expect(url).toBe('https://example.com/v1/models');
  });

  test('no Authorization header when no gateway_token', () => {
    const rec = makeRecord({ standard_url: 'https://example.com' });
    const [, headers] = gatewayUrlAndHeaders(rec, '/path');
    expect(headers['Authorization']).toBeUndefined();
  });
});

// ── parseJsonOutput ──────────────────────────────────────────────────────────

describe('parseJsonOutput', () => {
  test('parses a simple JSON object', () => {
    const result = parseJsonOutput('{"foo":"bar"}');
    expect(result).toEqual({ foo: 'bar' });
  });

  test('parses JSON after leading non-JSON lines', () => {
    const output = 'some log line\nanother line\n{"jobs":[]}';
    expect(parseJsonOutput(output)).toEqual({ jobs: [] });
  });

  test('parses JSON array', () => {
    expect(parseJsonOutput('[1,2,3]')).toEqual([1, 2, 3]);
  });

  test('throws when no JSON found', () => {
    expect(() => parseJsonOutput('no json here\njust text')).toThrow('No JSON found');
  });

  test('parses multiline JSON starting after log lines', () => {
    const output = 'log: starting\n{\n  "key": "value"\n}';
    expect(parseJsonOutput(output)).toEqual({ key: 'value' });
  });

  test('parses JSON object when trailing log noise follows the payload', () => {
    const output = [
      '\u001b[32mprobe:\u001b[0m starting',
      '{"auth":{"probes":{"totalTargets":1,"results":[{"status":"ok"}]}}}',
      'post-run log line',
    ].join('\n');

    expect(parseJsonOutput(output)).toEqual({
      auth: {
        probes: {
          totalTargets: 1,
          results: [{ status: 'ok' }],
        },
      },
    });
  });
});

// ── syntheticModels ──────────────────────────────────────────────────────────

describe('syntheticModels', () => {
  test('returns list object', () => {
    const models = syntheticModels();
    expect(models['object']).toBe('list');
  });

  test('contains openclaw-default model', () => {
    const models = syntheticModels();
    const data = models['data'] as Array<{ id: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].id).toBe('openclaw-default');
  });

  test('marks itself as synthetic', () => {
    expect(syntheticModels()['_synthetic']).toBe(true);
  });

  test('returns a new object each time', () => {
    const a = syntheticModels();
    const b = syntheticModels();
    expect(a).not.toBe(b);
  });
});
