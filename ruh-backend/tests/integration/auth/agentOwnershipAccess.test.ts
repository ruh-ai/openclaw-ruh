/**
 * Integration tests for developer-scoped agent access and publish authorization.
 * Requires a real PostgreSQL database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { setupTestDb, teardownTestDb, truncateAll } from '../../helpers/db';
import * as userStore from '../../../src/userStore';
import * as organizationMembershipStore from '../../../src/organizationMembershipStore';
import { hashPassword } from '../../../src/auth/passwords';
import { withConn } from '../../../src/db';

let requestFn: typeof import('../../helpers/app').request;

const PASSWORD = 'SecurePass1!';

type SessionFixture = {
  userId: string;
  orgId: string;
  accessToken: string;
  refreshToken: string;
};

beforeAll(async () => {
  await setupTestDb();
  ({ request: requestFn } = await import('../../helpers/app'));
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await teardownTestDb();
});

async function registerDeveloperOwner(email: string, orgName: string, orgSlug: string): Promise<SessionFixture> {
  const response = await requestFn()
    .post('/api/auth/register')
    .send({
      email,
      password: PASSWORD,
      displayName: email.split('@')[0],
      organizationName: orgName,
      organizationSlug: orgSlug,
      organizationKind: 'developer',
      membershipRole: 'owner',
    })
    .expect(201);

  return {
    userId: response.body.user.id,
    orgId: response.body.activeOrganization.id,
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

async function createSameOrgDeveloper(
  orgId: string,
  email: string,
  displayName: string,
): Promise<SessionFixture> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await userStore.createUser(email, passwordHash, displayName, 'developer', orgId);
  await organizationMembershipStore.createMembership(orgId, user.id, 'developer');

  const loginResponse = await requestFn()
    .post('/api/auth/login')
    .send({
      email,
      password: PASSWORD,
    })
    .expect(200);

  return {
    userId: user.id,
    orgId,
    accessToken: loginResponse.body.accessToken,
    refreshToken: loginResponse.body.refreshToken,
  };
}

async function registerCustomerAdmin(email: string, orgName: string, orgSlug: string): Promise<SessionFixture> {
  const response = await requestFn()
    .post('/api/auth/register')
    .send({
      email,
      password: PASSWORD,
      displayName: email.split('@')[0],
      organizationName: orgName,
      organizationSlug: orgSlug,
      organizationKind: 'customer',
      membershipRole: 'admin',
    })
    .expect(201);

  return {
    userId: response.body.user.id,
    orgId: response.body.activeOrganization.id,
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

describe('developer-scoped agents and marketplace publish', () => {
  test('GET /api/agents requires authentication', async () => {
    const response = await requestFn().get('/api/agents');
    expect(response.status).toBe(401);
  });

  test('customer users cannot create builder agents', async () => {
    const customer = await registerCustomerAdmin('customer-admin@ruh.ai', 'Customer Org', 'customer-org');

    const response = await requestFn()
      .post('/api/agents')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        name: 'Customer Attempt',
        description: 'Should be blocked from builder agent creation.',
      });

    expect(response.status).toBe(403);
  });

  test('developers only see and mutate the agents they created, even within the same developer org', async () => {
    const owner = await registerDeveloperOwner('owner@acme-dev.test', 'Acme Dev', 'acme-dev');
    const coworker = await createSameOrgDeveloper(owner.orgId, 'coworker@acme-dev.test', 'Coworker');

    const ownerCreateResponse = await requestFn()
      .post('/api/agents')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Owner Agent',
        description: 'Owned by the primary developer.',
      })
      .expect(200);

    const coworkerCreateResponse = await requestFn()
      .post('/api/agents')
      .set('Authorization', `Bearer ${coworker.accessToken}`)
      .send({
        name: 'Coworker Agent',
        description: 'Owned by another developer in the same org.',
      })
      .expect(200);

    const ownerAgentId = String(ownerCreateResponse.body.id);
    const coworkerAgentId = String(coworkerCreateResponse.body.id);

    const ownershipRow = await withConn(async (client) => {
      const result = await client.query(
        'SELECT created_by, org_id FROM agents WHERE id = $1',
        [ownerAgentId],
      );
      return result.rows[0];
    });

    expect(ownershipRow.created_by).toBe(owner.userId);
    expect(ownershipRow.org_id).toBe(owner.orgId);

    const ownerListResponse = await requestFn()
      .get('/api/agents')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(ownerListResponse.body).toHaveLength(1);
    expect(ownerListResponse.body[0].id).toBe(ownerAgentId);

    const coworkerListResponse = await requestFn()
      .get('/api/agents')
      .set('Authorization', `Bearer ${coworker.accessToken}`)
      .expect(200);

    expect(coworkerListResponse.body).toHaveLength(1);
    expect(coworkerListResponse.body[0].id).toBe(coworkerAgentId);

    await requestFn()
      .get(`/api/agents/${coworkerAgentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);

    await requestFn()
      .patch(`/api/agents/${coworkerAgentId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ description: 'Attempted cross-owner update.' })
      .expect(404);
  });

  test('marketplace listing creation rejects developers who do not own the referenced agent', async () => {
    const owner = await registerDeveloperOwner('publisher-owner@acme-dev.test', 'Publisher Org', 'publisher-org');
    const coworker = await createSameOrgDeveloper(owner.orgId, 'publisher-coworker@acme-dev.test', 'Publisher Coworker');

    const ownerCreateResponse = await requestFn()
      .post('/api/agents')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Marketplace Owner Agent',
        description: 'Will be published by its creator only.',
      })
      .expect(200);

    const agentId = String(ownerCreateResponse.body.id);

    const deniedPublishResponse = await requestFn()
      .post('/api/marketplace/listings')
      .set('Authorization', `Bearer ${coworker.accessToken}`)
      .send({
        agentId,
        title: 'Unauthorized Listing',
        summary: 'Should fail because coworker is not the creator.',
      });

    expect(deniedPublishResponse.status).toBe(403);

    const publishResponse = await requestFn()
      .post('/api/marketplace/listings')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        agentId,
        title: 'Authorized Listing',
        summary: 'Published by the owning creator.',
      })
      .expect(201);

    expect(publishResponse.body.agentId).toBe(agentId);
    expect(publishResponse.body.publisherId).toBe(owner.userId);
    expect(publishResponse.body.ownerOrgId).toBe(owner.orgId);
  });

  test('marketplace listings are visible and manageable across the owning developer org, but hidden from other orgs', async () => {
    const owner = await registerDeveloperOwner('org-owner@acme-dev.test', 'Org Marketplace', 'org-marketplace');
    const teammate = await createSameOrgDeveloper(owner.orgId, 'org-teammate@acme-dev.test', 'Org Teammate');
    const outsider = await registerDeveloperOwner('other-owner@other-dev.test', 'Other Dev Org', 'other-dev-org');

    const ownerCreateResponse = await requestFn()
      .post('/api/agents')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'Org Owned Marketplace Agent',
        description: 'Published once, then shared at the org listing layer.',
      })
      .expect(200);

    const publishResponse = await requestFn()
      .post('/api/marketplace/listings')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        agentId: String(ownerCreateResponse.body.id),
        title: 'Org-Owned Listing',
        summary: 'Visible to teammates in the same developer org.',
      })
      .expect(201);

    const listingId = String(publishResponse.body.id);
    expect(publishResponse.body.ownerOrgId).toBe(owner.orgId);

    const teammateListings = await requestFn()
      .get('/api/marketplace/my/listings')
      .set('Authorization', `Bearer ${teammate.accessToken}`)
      .expect(200);

    expect(teammateListings.body.items).toHaveLength(1);
    expect(teammateListings.body.items[0].id).toBe(listingId);

    const teammatePatch = await requestFn()
      .patch(`/api/marketplace/listings/${listingId}`)
      .set('Authorization', `Bearer ${teammate.accessToken}`)
      .send({ summary: 'Updated by a teammate in the same developer org.' })
      .expect(200);

    expect(teammatePatch.body.summary).toBe('Updated by a teammate in the same developer org.');

    const outsiderListings = await requestFn()
      .get('/api/marketplace/my/listings')
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(200);

    expect(outsiderListings.body.items).toHaveLength(0);

    await requestFn()
      .patch(`/api/marketplace/listings/${listingId}`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ summary: 'Cross-org update should fail.' })
      .expect(403);
  });
});
