import type { BuilderAppAccess } from "@/lib/auth/app-access";

export interface BuilderTenantMembership {
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  organizationKind: string;
  organizationPlan?: string;
  role: string;
  status: string;
}

export interface BuilderSurfaceSession {
  appAccess?: BuilderAppAccess | null;
  memberships?: BuilderTenantMembership[] | null;
}

const BUILDER_ROLES = new Set(["owner", "developer"]);

export function getEligibleDeveloperMemberships(
  session: BuilderSurfaceSession | null | undefined
): BuilderTenantMembership[] {
  return (session?.memberships ?? []).filter(
    (membership) =>
      membership.organizationKind === "developer" &&
      membership.status === "active" &&
      BUILDER_ROLES.has(membership.role)
  );
}

export async function ensureBuilderSurfaceSession<T extends BuilderSurfaceSession>(
  session: T,
  switchOrganization: (organizationId: string) => Promise<T>
): Promise<T> {
  if (session.appAccess?.builder === true) {
    return session;
  }

  const membership = getEligibleDeveloperMemberships(session)[0];
  if (!membership) {
    return session;
  }

  return switchOrganization(membership.organizationId);
}
