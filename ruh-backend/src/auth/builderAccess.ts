import type { AuthUser } from './middleware';
import * as orgStore from '../orgStore';
import { httpError } from '../utils';

export async function requireActiveDeveloperOrg(user?: AuthUser) {
  if (!user) {
    throw httpError(401, 'Authentication required');
  }

  if (user.role !== 'developer' && user.role !== 'admin') {
    throw httpError(403, 'Builder access requires a developer account');
  }

  if (!user.orgId) {
    throw httpError(403, 'Builder access requires an active developer organization');
  }

  const organization = await orgStore.getOrg(user.orgId);
  if (!organization || organization.kind !== 'developer') {
    throw httpError(403, 'Builder access requires an active developer organization');
  }

  return {
    user,
    organization,
  };
}
