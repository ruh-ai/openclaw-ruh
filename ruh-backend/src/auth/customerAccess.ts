import type { AuthUser } from './middleware';
import * as membershipStore from '../organizationMembershipStore';
import * as orgStore from '../orgStore';
import { httpError } from '../utils';

export async function requireActiveCustomerOrg(user?: AuthUser) {
  if (!user) {
    throw httpError(401, 'Authentication required');
  }

  if (!user.orgId) {
    throw httpError(403, 'Customer access requires an active customer organization');
  }

  const organization = await orgStore.getOrg(user.orgId);
  if (!organization || organization.kind !== 'customer') {
    throw httpError(403, 'Customer access requires an active customer organization');
  }

  const membership = await membershipStore.getMembershipForUserOrg(
    user.userId,
    organization.id,
  );
  if (!membership || membership.status !== 'active') {
    throw httpError(403, 'Customer access requires an active organization membership');
  }

  if (!['owner', 'admin', 'employee'].includes(membership.role)) {
    throw httpError(403, 'Customer access requires a customer organization membership');
  }

  return {
    user,
    organization,
    membership,
  };
}
