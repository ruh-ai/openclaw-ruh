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
});
