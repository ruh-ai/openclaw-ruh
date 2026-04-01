import type { CustomerAppAccess } from "@/lib/auth/app-access";

export interface CustomerSessionMembership {
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  organizationKind: string;
  organizationPlan?: string;
  role: string;
  status: string;
}

export interface CustomerSurfaceSession {
  appAccess?: CustomerAppAccess | null;
  memberships?: CustomerSessionMembership[] | null;
}

const CUSTOMER_ROLES = new Set(["owner", "admin", "employee"]);

export function getEligibleCustomerMemberships(
  session: CustomerSurfaceSession | null | undefined
): CustomerSessionMembership[] {
  return (session?.memberships ?? []).filter(
    (membership) =>
      membership.organizationKind === "customer" &&
      membership.status === "active" &&
      CUSTOMER_ROLES.has(membership.role)
  );
}

export async function ensureCustomerSurfaceSession<T extends CustomerSurfaceSession>(
  session: T,
  switchOrganization: (organizationId: string) => Promise<T>
): Promise<T> {
  if (session.appAccess?.customer === true) {
    return session;
  }

  const membership = getEligibleCustomerMemberships(session)[0];
  if (!membership) {
    return session;
  }

  return switchOrganization(membership.organizationId);
}
