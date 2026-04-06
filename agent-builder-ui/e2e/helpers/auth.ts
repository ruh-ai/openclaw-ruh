/**
 * Shared auth setup for E2E tests.
 *
 * The builder middleware enforces auth cookies on all non-public routes.
 * Every E2E test must call `setupAuth(page)` before navigation to bypass
 * the login redirect and provide mocked session data.
 */

import type { Page, Route } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const APP_ORIGIN = "http://localhost:3000";

export const AUTHENTICATED_USER = {
  id: "user-1",
  fullName: "Test Operator",
  email: "operator@example.com",
  company: "Ruh",
  department: "Product",
  jobRole: "QA",
  phoneNumber: "",
  profileImage: "",
  isFirstLogin: false,
};

export const AUTH_SESSION = {
  user: {
    id: "user-1",
    email: "operator@example.com",
    displayName: "Test Operator",
    role: "developer",
  },
  activeOrganization: {
    id: "org-test-001",
    name: "Test Dev Org",
    slug: "test-dev-org",
    kind: "developer",
  },
  memberships: [
    {
      organizationId: "org-test-001",
      organizationName: "Test Dev Org",
      organizationSlug: "test-dev-org",
      organizationKind: "developer",
      role: "owner",
      status: "active",
    },
  ],
  appAccess: {
    admin: false,
    builder: true,
    customer: false,
  },
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
};

/**
 * Set auth cookies and mock auth endpoints so the middleware allows navigation.
 * Call this before `page.goto()` in every test.
 */
export async function setupAuth(page: Page) {
  await page.context().addCookies([
    { name: "accessToken", value: "test-access-token", url: APP_ORIGIN },
    { name: "refreshToken", value: "test-refresh-token", url: APP_ORIGIN },
  ]);

  await page.route(`${API_BASE}/users/me`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTHENTICATED_USER),
    });
  });

  await page.route(`${API_BASE}/api/auth/me`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(AUTH_SESSION),
    });
  });
}
