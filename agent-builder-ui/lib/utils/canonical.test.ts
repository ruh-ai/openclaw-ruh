import { afterEach, describe, expect, test } from "bun:test";

import {
  generateCanonicalMetadata,
  generateCanonicalUrl,
  getBaseUrl,
} from "./canonical";

const env = process.env as Record<string, string | undefined>;
const originalAppUrl = env.NEXT_PUBLIC_APP_URL;
const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete env.NEXT_PUBLIC_APP_URL;
  } else {
    env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }

  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }
});

describe("canonical URL helpers", () => {
  test("prefers NEXT_PUBLIC_APP_URL and strips a trailing slash", () => {
    env.NEXT_PUBLIC_APP_URL = "https://builder.ruh.ai/";
    env.NODE_ENV = "production";

    expect(getBaseUrl()).toBe("https://builder.ruh.ai");
  });

  test("falls back to localhost during development when app URL is unset", () => {
    delete env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = "development";

    expect(getBaseUrl()).toBe("http://localhost:3000");
  });

  test("normalizes missing leading slashes and trims trailing slashes from non-root paths", () => {
    env.NEXT_PUBLIC_APP_URL = "https://builder.ruh.ai";

    expect(generateCanonicalUrl("authenticate/")).toBe("https://builder.ruh.ai/authenticate");
    expect(generateCanonicalUrl("/agents/")).toBe("https://builder.ruh.ai/agents");
  });

  test("builds metadata with the canonical root URL", () => {
    env.NEXT_PUBLIC_APP_URL = "https://builder.ruh.ai/";

    expect(generateCanonicalMetadata("/")).toEqual({
      alternates: {
        canonical: "https://builder.ruh.ai/",
      },
    });
  });
});
