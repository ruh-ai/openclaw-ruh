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
  status: 'active' | 'suspended' | 'archived';
}

export interface ActiveMembershipContext {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationKind: 'developer' | 'customer';
  organizationPlan: string;
  organizationStatus: 'active' | 'suspended' | 'archived';
  role: string;
  status: string;
}

export interface DeriveAppAccessInput {
  platformRole: 'platform_admin' | 'user';
  memberships: ActiveMembershipContext[];
}

export interface DeriveSessionAppAccessInput {
  platformRole: 'platform_admin' | 'user';
  activeMembership: ActiveMembershipContext | null;
}

export function deriveAppAccess({
  platformRole,
  memberships,
}: DeriveAppAccessInput): AppAccess {
  const active = memberships.filter(
    (m) => m.status === 'active' && m.organizationStatus === 'active',
  );

  const builder = active.some(
    (m) =>
      m.organizationKind === 'developer' &&
      (m.role === 'owner' || m.role === 'developer'),
  );

  const customer = active.some(
    (m) =>
      m.organizationKind === 'customer' &&
      (m.role === 'owner' || m.role === 'admin' || m.role === 'employee'),
  );

  return {
    admin: platformRole === 'platform_admin',
    builder,
    customer,
  };
}

export function deriveSessionAppAccess({
  platformRole,
  activeMembership,
}: DeriveSessionAppAccessInput): AppAccess {
  const isActive =
    activeMembership?.status === 'active' &&
    activeMembership.organizationStatus === 'active';
  const membership = isActive ? activeMembership : null;

  const builder =
    membership?.organizationKind === 'developer' &&
    (membership.role === 'owner' || membership.role === 'developer');

  const customer =
    membership?.organizationKind === 'customer' &&
    (membership.role === 'owner' ||
      membership.role === 'admin' ||
      membership.role === 'employee');

  return {
    admin: platformRole === 'platform_admin',
    builder,
    customer,
  };
}
