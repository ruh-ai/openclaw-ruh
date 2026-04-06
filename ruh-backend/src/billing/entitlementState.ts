import type { BillingStatus, EntitlementStatus } from '../billingStore';

export interface EntitlementOverrideState {
  kind: string;
  status: string;
  effectiveStartsAt?: string | null;
  effectiveEndsAt?: string | null;
}

export interface ResolveEntitlementAccessInput {
  billingStatus: BillingStatus;
  entitlementStatus: EntitlementStatus;
  graceEndsAt?: string | null;
  overrides?: EntitlementOverrideState[];
  now?: Date;
}

export interface EntitlementAccessDecision {
  status: 'active' | 'grace_period' | 'suspended' | 'revoked';
  canAccess: boolean;
  overrideActive: boolean;
}

const ACCESS_GRANT_OVERRIDE_KINDS = new Set([
  'temporary_access',
  'manual_resume',
  'seat_comp',
]);

const ACCESS_BLOCK_OVERRIDE_KINDS = new Set([
  'manual_suspend',
  'credit_hold',
]);

function isOverrideActive(
  override: EntitlementOverrideState,
  now: Date,
): boolean {
  if (override.status !== 'active') return false;

  const startsAt = override.effectiveStartsAt ? new Date(override.effectiveStartsAt) : null;
  const endsAt = override.effectiveEndsAt ? new Date(override.effectiveEndsAt) : null;

  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() <= now.getTime()) return false;
  return true;
}

function hasFutureGraceWindow(graceEndsAt: string | null | undefined, now: Date): boolean {
  if (!graceEndsAt) return false;
  return new Date(graceEndsAt).getTime() > now.getTime();
}

export function resolveEntitlementAccess({
  billingStatus,
  entitlementStatus,
  graceEndsAt,
  overrides = [],
  now = new Date(),
}: ResolveEntitlementAccessInput): EntitlementAccessDecision {
  const activeOverrides = overrides.filter((override) => isOverrideActive(override, now));

  if (activeOverrides.some((override) => ACCESS_BLOCK_OVERRIDE_KINDS.has(override.kind))) {
    return { status: 'suspended', canAccess: false, overrideActive: true };
  }

  if (
    entitlementStatus === 'override_active' ||
    activeOverrides.some((override) => ACCESS_GRANT_OVERRIDE_KINDS.has(override.kind))
  ) {
    return { status: 'active', canAccess: true, overrideActive: true };
  }

  if (entitlementStatus === 'revoked') {
    return { status: 'revoked', canAccess: false, overrideActive: false };
  }

  if (entitlementStatus === 'suspended') {
    return { status: 'suspended', canAccess: false, overrideActive: false };
  }

  if (
    entitlementStatus === 'grace_period' ||
    ((billingStatus === 'past_due' || billingStatus === 'unpaid') &&
      hasFutureGraceWindow(graceEndsAt, now))
  ) {
    return { status: 'grace_period', canAccess: true, overrideActive: false };
  }

  if (billingStatus === 'canceled' || billingStatus === 'unpaid') {
    return { status: 'suspended', canAccess: false, overrideActive: false };
  }

  return { status: 'active', canAccess: true, overrideActive: false };
}
