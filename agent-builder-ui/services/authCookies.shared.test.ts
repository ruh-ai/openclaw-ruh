import { describe, expect, test } from "bun:test";

import {
  buildAuthCookieOptions,
  buildClearedAuthCookieOptions,
} from "./authCookies.shared";

describe("auth cookie options", () => {
  test("uses matching scope attributes for set and clear paths", () => {
    const setOptions = buildAuthCookieOptions({ maxAge: 3600 });
    const clearOptions = buildClearedAuthCookieOptions();

    expect(clearOptions).toMatchObject({
      path: setOptions.path,
      domain: setOptions.domain,
      httpOnly: setOptions.httpOnly,
      secure: setOptions.secure,
      sameSite: setOptions.sameSite,
      maxAge: 0,
    });
  });
});
