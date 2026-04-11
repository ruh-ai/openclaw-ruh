import {
  assertCustomerAppAccess,
  hasCustomerAppAccess,
} from "@/lib/auth/app-access";

describe("customer app access", () => {
  test("returns true when the session has customer access", () => {
    expect(
      hasCustomerAppAccess({
        appAccess: { admin: false, builder: false, customer: true },
      })
    ).toBe(true);
  });

  test("returns false when customer access is missing", () => {
    expect(
      hasCustomerAppAccess({
        appAccess: { admin: false, builder: true, customer: false },
      })
    ).toBe(false);
  });

  test("throws a 403-like error when customer access is missing", () => {
    expect(() =>
      assertCustomerAppAccess({
        appAccess: { admin: true, builder: false, customer: false },
      })
    ).toThrow("Customer organization access required");
  });

  test("returns false when record is null", () => {
    expect(hasCustomerAppAccess(null)).toBe(false);
  });

  test("returns false when record is undefined", () => {
    expect(hasCustomerAppAccess(undefined)).toBe(false);
  });

  test("returns false when appAccess is null", () => {
    expect(hasCustomerAppAccess({ appAccess: null })).toBe(false);
  });

  test("returns false when appAccess is undefined", () => {
    expect(hasCustomerAppAccess({ appAccess: undefined })).toBe(false);
  });

  test("throws when record is null", () => {
    expect(() => assertCustomerAppAccess(null)).toThrow("Customer organization access required");
  });

  test("throws when record is undefined", () => {
    expect(() => assertCustomerAppAccess(undefined)).toThrow("Customer organization access required");
  });

  test("error thrown by assertCustomerAppAccess has status 403", () => {
    try {
      assertCustomerAppAccess({ appAccess: { admin: false, builder: false, customer: false } });
      fail("expected throw");
    } catch (err: unknown) {
      expect((err as { response?: { status?: number } }).response?.status).toBe(403);
    }
  });

  test("does not throw when customer access is true", () => {
    expect(() =>
      assertCustomerAppAccess({ appAccess: { admin: false, builder: false, customer: true } })
    ).not.toThrow();
  });
});
