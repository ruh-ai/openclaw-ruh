import { afterEach, describe, expect, test } from "bun:test";

import { getMarketplaceDestination } from "./marketplace-url";

const env = process.env as Record<string, string | undefined>;
const originalMarketplaceUrl = env.NEXT_PUBLIC_MARKETPLACE_URL;
const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  if (originalMarketplaceUrl === undefined) {
    delete env.NEXT_PUBLIC_MARKETPLACE_URL;
  } else {
    env.NEXT_PUBLIC_MARKETPLACE_URL = originalMarketplaceUrl;
  }

  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }
});

describe("getMarketplaceDestination", () => {
  test("appends /marketplace when NEXT_PUBLIC_MARKETPLACE_URL is an origin", () => {
    env.NEXT_PUBLIC_MARKETPLACE_URL = "https://app.ruh.ai/";
    env.NODE_ENV = "production";

    expect(getMarketplaceDestination()).toBe("https://app.ruh.ai/marketplace");
  });

  test("preserves an explicit marketplace path", () => {
    env.NEXT_PUBLIC_MARKETPLACE_URL = "https://app.ruh.ai/custom-marketplace/";
    env.NODE_ENV = "production";

    expect(getMarketplaceDestination()).toBe("https://app.ruh.ai/custom-marketplace");
  });

  test("falls back to the local customer app during development", () => {
    delete env.NEXT_PUBLIC_MARKETPLACE_URL;
    env.NODE_ENV = "development";

    expect(getMarketplaceDestination()).toBe("http://localhost:3000/marketplace");
  });

  test("returns null in production when no marketplace URL is configured", () => {
    delete env.NEXT_PUBLIC_MARKETPLACE_URL;
    env.NODE_ENV = "production";

    expect(getMarketplaceDestination()).toBeNull();
  });
});
