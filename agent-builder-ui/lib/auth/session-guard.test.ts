import { describe, expect, test } from "bun:test";

import {
  getAuthRedirectPath,
  resolveSessionGateDecision,
  type SessionGateContext,
} from "./session-guard";

describe("getAuthRedirectPath", () => {
  test("preserves the full requested path and query string", () => {
    expect(
      getAuthRedirectPath({
        pathname: "/agents/create",
        search: "?tab=review&from=deep-link",
      })
    ).toBe("/authenticate?redirect_url=%2Fagents%2Fcreate%3Ftab%3Dreview%26from%3Ddeep-link");
  });
});

describe("resolveSessionGateDecision", () => {
  test("redirects protected routes with no cookies to authenticate", () => {
    const decision = resolveSessionGateDecision({
      pathname: "/agents",
      search: "?view=grid",
      hasAccessToken: false,
      hasRefreshToken: false,
      hasUser: false,
      bootstrapStatus: "idle",
    });

    expect(decision).toEqual({
      type: "redirect",
      href: "/authenticate?redirect_url=%2Fagents%3Fview%3Dgrid",
      clearUser: true,
    });
  });

  test("allows authenticate when there is no session", () => {
    const decision = resolveSessionGateDecision({
      pathname: "/authenticate",
      search: "",
      hasAccessToken: false,
      hasRefreshToken: false,
      hasUser: false,
      bootstrapStatus: "idle",
    });

    expect(decision).toEqual({ type: "allow", clearUser: false });
  });

  test("redirects authenticated auth-page visits back into the platform", () => {
    const decision = resolveSessionGateDecision({
      pathname: "/authenticate",
      search: "?redirect_url=%2Fagents%2Fcreate",
      hasAccessToken: true,
      hasRefreshToken: true,
      hasUser: true,
      bootstrapStatus: "success",
    });

    expect(decision).toEqual({
      type: "redirect",
      href: "/agents/create",
      clearUser: false,
    });
  });

  test("fails closed when bootstrap returns an auth error on a protected route", () => {
    const decision = resolveSessionGateDecision({
      pathname: "/agents/create",
      search: "",
      hasAccessToken: true,
      hasRefreshToken: true,
      hasUser: true,
      bootstrapStatus: "auth_error",
    });

    expect(decision).toEqual({
      type: "redirect",
      href: "/authenticate?redirect_url=%2Fagents%2Fcreate",
      clearUser: true,
    });
  });

  test("keeps a protected route accessible while bootstrap is still loading", () => {
    const decision = resolveSessionGateDecision({
      pathname: "/agents",
      search: "",
      hasAccessToken: true,
      hasRefreshToken: false,
      hasUser: false,
      bootstrapStatus: "loading",
    });

    expect(decision).toEqual({ type: "pending", clearUser: false });
  });

  test("allows an authenticated protected route after bootstrap succeeds", () => {
    const decision = resolveSessionGateDecision({
      pathname: "/agents",
      search: "",
      hasAccessToken: true,
      hasRefreshToken: false,
      hasUser: true,
      bootstrapStatus: "success",
    });

    expect(decision).toEqual({ type: "allow", clearUser: false });
  });

  test("treats 401 and 403 bootstrap failures as auth errors", () => {
    const cases: SessionGateContext[] = [
      {
        pathname: "/agents",
        search: "",
        hasAccessToken: true,
        hasRefreshToken: false,
        hasUser: false,
        bootstrapStatus: "error",
        bootstrapErrorStatus: 401,
      },
      {
        pathname: "/agents",
        search: "",
        hasAccessToken: true,
        hasRefreshToken: false,
        hasUser: false,
        bootstrapStatus: "error",
        bootstrapErrorStatus: 403,
      },
    ];

    for (const context of cases) {
      expect(resolveSessionGateDecision(context)).toEqual({
        type: "redirect",
        href: "/authenticate?redirect_url=%2Fagents",
        clearUser: true,
      });
    }
  });
});
