export interface AppAccess {
  admin: boolean;
  builder: boolean;
  customer: boolean;
}

export interface ActiveOrganizationContext {
  id: string;
  name: string;
  slug: string;
  kind: 'developer' | 'customer';
  plan: string;
}

export interface ActiveMembershipContext {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationKind: 'developer' | 'customer';
  organizationPlan: string;
  role: string;
  status: string;
}

export interface DeriveAppAccessInput {
  platformRole: 'platform_admin' | 'user';
  activeOrganization: ActiveOrganizationContext | null;
  activeMembership: ActiveMembershipContext | null;
}

function isActiveMembership(
  activeOrganization: ActiveOrganizationContext | null,
  activeMembership: ActiveMembershipContext | null,
): boolean {
  if (!activeOrganization || !activeMembership) {
    return false;
  }
  if (activeMembership.status !== 'active') {
    return false;
  }
  return activeMembership.organizationId === activeOrganization.id;
}

export function deriveAppAccess({
  platformRole,
  activeOrganization,
  activeMembership,
}: DeriveAppAccessInput): AppAccess {
  const activeMembershipMatchesOrg = isActiveMembership(activeOrganization, activeMembership);

  const builder =
    activeMembershipMatchesOrg
    && activeOrganization?.kind === 'developer'
    && (activeMembership?.role === 'owner' || activeMembership?.role === 'developer');

  const customer =
    activeMembershipMatchesOrg
    && activeOrganization?.kind === 'customer'
    && (
      activeMembership?.role === 'owner'
      || activeMembership?.role === 'admin'
      || activeMembership?.role === 'employee'
    );

  return {
    admin: platformRole === 'platform_admin',
    builder,
    customer,
  };
}
