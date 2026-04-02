import { describe, expect, test } from 'bun:test';
import { resolveEntitlementAccess } from '../../src/billing/entitlementState';

describe('resolveEntitlementAccess', () => {
  test('grants access for an active entitlement', () => {
    const decision = resolveEntitlementAccess({
      billingStatus: 'active',
      entitlementStatus: 'active',
    });

    expect(decision).toEqual({
      status: 'active',
      canAccess: true,
      overrideActive: false,
    });
  });

  test('keeps access during a future grace window for past-due billing', () => {
    const decision = resolveEntitlementAccess({
      billingStatus: 'past_due',
      entitlementStatus: 'active',
      graceEndsAt: '2099-01-01T00:00:00Z',
      now: new Date('2026-04-02T00:00:00Z'),
    });

    expect(decision).toEqual({
      status: 'grace_period',
      canAccess: true,
      overrideActive: false,
    });
  });

  test('blocks access for a revoked entitlement', () => {
    const decision = resolveEntitlementAccess({
      billingStatus: 'active',
      entitlementStatus: 'revoked',
    });

    expect(decision).toEqual({
      status: 'revoked',
      canAccess: false,
      overrideActive: false,
    });
  });

  test('active override can temporarily re-enable access', () => {
    const decision = resolveEntitlementAccess({
      billingStatus: 'unpaid',
      entitlementStatus: 'revoked',
      overrides: [{
        kind: 'temporary_access',
        status: 'active',
        effectiveStartsAt: '2026-04-01T00:00:00Z',
        effectiveEndsAt: '2026-04-10T00:00:00Z',
      }],
      now: new Date('2026-04-02T00:00:00Z'),
    });

    expect(decision).toEqual({
      status: 'active',
      canAccess: true,
      overrideActive: true,
    });
  });
});
