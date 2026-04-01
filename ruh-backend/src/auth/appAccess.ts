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
  memberships: ActiveMembershipContext[];
}

export function deriveAppAccess({
  platformRole,
  memberships,
}: DeriveAppAccessInput): AppAccess {
  const active = memberships.filter((m) => m.status === 'active');

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
