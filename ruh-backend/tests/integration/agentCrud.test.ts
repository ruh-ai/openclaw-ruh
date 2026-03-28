/**
 * Integration tests for agent CRUD/config routes — requires a real PostgreSQL database.
 * Set TEST_DATABASE_URL to an accessible test DB before running.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { request } from '../helpers/app';
import { setupTestDb, teardownTestDb, truncateAll } from '../helpers/db';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('agent CRUD/config routes (real DB)', () => {
  test('POST + GET /api/agents round-trip structured tool, trigger, and channel metadata', async () => {
    const createRes = await request()
      .post('/api/agents')
      .send({
        name: 'Google Ads Optimizer',
        description: 'Watches campaign pacing and budgets.',
        skills: ['Campaign Audit'],
        triggerLabel: 'Weekday pacing check',
        status: 'draft',
        runtimeInputs: [
          {
            key: 'GOOGLE_ADS_CUSTOMER_ID',
            label: 'Customer ID',
            description: 'Google Ads customer ID for the target account.',
            required: true,
            source: 'architect_requirement',
            value: '123-456-7890',
          },
        ],
        toolConnections: [
          {
            toolId: 'google',
            name: 'Google Workspace',
            description: 'Read Google Ads reports through the shared workspace connector.',
            status: 'missing_secret',
            authKind: 'oauth',
            connectorType: 'mcp',
            configSummary: ['Credentials still required'],
          },
        ],
        triggers: [
          {
            id: 'weekday-9am',
            title: 'Weekday pacing check',
            kind: 'schedule',
            status: 'supported',
            description: 'Runs every weekday at 9 AM.',
            schedule: '0 9 * * 1-5',
          },
        ],
        channels: [
          {
            kind: 'slack',
            status: 'planned',
            label: 'Slack',
            description: 'Configure the workspace bot after deploy.',
          },
        ],
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.id).toBeString();
    expect(createRes.body.tool_connections).toEqual([
      {
        toolId: 'google',
        name: 'Google Workspace',
        description: 'Read Google Ads reports through the shared workspace connector.',
        status: 'missing_secret',
        authKind: 'oauth',
        connectorType: 'mcp',
        configSummary: ['Credentials still required'],
      },
    ]);
    expect(createRes.body.runtime_inputs).toEqual([
      {
        key: 'GOOGLE_ADS_CUSTOMER_ID',
        label: 'Customer ID',
        description: 'Google Ads customer ID for the target account.',
        required: true,
        source: 'architect_requirement',
        value: '123-456-7890',
      },
    ]);
    expect(createRes.body.triggers).toEqual([
      {
        id: 'weekday-9am',
        title: 'Weekday pacing check',
        kind: 'schedule',
        status: 'supported',
        description: 'Runs every weekday at 9 AM.',
        schedule: '0 9 * * 1-5',
      },
    ]);
    expect(createRes.body.channels).toEqual([
      {
        kind: 'slack',
        status: 'planned',
        label: 'Slack',
        description: 'Configure the workspace bot after deploy.',
      },
    ]);

    const getRes = await request().get(`/api/agents/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.runtime_inputs).toEqual(createRes.body.runtime_inputs);
    expect(getRes.body.tool_connections).toEqual(createRes.body.tool_connections);
    expect(getRes.body.triggers).toEqual(createRes.body.triggers);
    expect(getRes.body.channels).toEqual(createRes.body.channels);
  });

  test('credential endpoints keep secrets off normal agent reads while config patch stays structured', async () => {
    const createRes = await request()
      .post('/api/agents')
      .send({
        name: 'Google Ads Optimizer',
        description: 'Watches campaign pacing and budgets.',
        skills: ['Campaign Audit'],
        triggerLabel: 'Weekday pacing check',
        status: 'draft',
      });

    expect(createRes.status).toBe(200);
    const agentId = createRes.body.id as string;

    const saveCredentialRes = await request()
      .put(`/api/agents/${agentId}/credentials/google`)
      .send({
        credentials: {
          GOOGLE_CLIENT_ID: 'client-id',
          GOOGLE_CLIENT_SECRET: 'client-secret',
        },
      });

    expect(saveCredentialRes.status).toBe(200);
    expect(saveCredentialRes.body).toEqual({ ok: true, toolId: 'google' });

    const patchRes = await request()
      .patch(`/api/agents/${agentId}/config`)
      .send({
        runtimeInputs: [
          {
            key: 'GOOGLE_ADS_CUSTOMER_ID',
            label: 'Customer ID',
            description: 'Google Ads customer ID for the target account.',
            required: true,
            source: 'architect_requirement',
            value: '123-456-7890',
          },
        ],
        toolConnections: [
          {
            toolId: 'google',
            name: 'Google Workspace',
            description: 'Read Google Ads reports through the shared workspace connector.',
            status: 'configured',
            authKind: 'oauth',
            connectorType: 'mcp',
            configSummary: ['Connected after secure credential save'],
          },
        ],
        triggers: [
          {
            id: 'weekday-9am',
            title: 'Weekday pacing check',
            kind: 'schedule',
            status: 'supported',
            description: 'Runs every weekday at 9 AM.',
            schedule: '0 9 * * 1-5',
          },
        ],
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.runtime_inputs).toEqual([
      {
        key: 'GOOGLE_ADS_CUSTOMER_ID',
        label: 'Customer ID',
        description: 'Google Ads customer ID for the target account.',
        required: true,
        source: 'architect_requirement',
        value: '123-456-7890',
      },
    ]);
    expect(patchRes.body.tool_connections).toEqual([
      {
        toolId: 'google',
        name: 'Google Workspace',
        description: 'Read Google Ads reports through the shared workspace connector.',
        status: 'configured',
        authKind: 'oauth',
        connectorType: 'mcp',
        configSummary: ['Connected after secure credential save'],
      },
    ]);
    expect(patchRes.body.triggers).toEqual([
      {
        id: 'weekday-9am',
        title: 'Weekday pacing check',
        kind: 'schedule',
        status: 'supported',
        description: 'Runs every weekday at 9 AM.',
        schedule: '0 9 * * 1-5',
      },
    ]);

    const getAgentRes = await request().get(`/api/agents/${agentId}`);
    expect(getAgentRes.status).toBe(200);
    expect(getAgentRes.body.runtime_inputs).toEqual(patchRes.body.runtime_inputs);
    expect(getAgentRes.body.tool_connections).toEqual(patchRes.body.tool_connections);
    expect(getAgentRes.body.triggers).toEqual(patchRes.body.triggers);
    expect(getAgentRes.body.agent_credentials).toBeUndefined();
    expect(getAgentRes.body.credentials).toBeUndefined();

    const credentialSummaryRes = await request().get(`/api/agents/${agentId}/credentials`);
    expect(credentialSummaryRes.status).toBe(200);
    expect(credentialSummaryRes.body).toHaveLength(1);
    expect(credentialSummaryRes.body[0]).toMatchObject({
      toolId: 'google',
      hasCredentials: true,
    });
    expect(credentialSummaryRes.body[0].encrypted).toBeUndefined();
    expect(credentialSummaryRes.body[0].iv).toBeUndefined();
  });
});
