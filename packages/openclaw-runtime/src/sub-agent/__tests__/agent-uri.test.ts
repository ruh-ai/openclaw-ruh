import { describe, expect, test } from "bun:test";
import {
  AgentUriError,
  buildAgentUri,
  isAgentUri,
  parseAgentUri,
} from "../agent-uri";

describe("buildAgentUri", () => {
  test("builds canonical form", () => {
    expect(
      buildAgentUri({
        pipelineId: "ecc-estimator",
        specialist: "intake-specialist",
        version: "0.1.0",
      }),
    ).toBe("openclaw://ecc-estimator/agents/intake-specialist@0.1.0");
  });

  test("accepts prerelease semver", () => {
    expect(
      buildAgentUri({
        pipelineId: "ecc",
        specialist: "intake",
        version: "1.0.0-rc.1",
      }),
    ).toBe("openclaw://ecc/agents/intake@1.0.0-rc.1");
  });

  test("rejects non-kebab pipelineId", () => {
    expect(() =>
      buildAgentUri({
        pipelineId: "ECC",
        specialist: "intake",
        version: "0.1.0",
      }),
    ).toThrow(AgentUriError);
  });

  test("rejects non-kebab specialist", () => {
    expect(() =>
      buildAgentUri({
        pipelineId: "ecc",
        specialist: "Intake_Specialist",
        version: "0.1.0",
      }),
    ).toThrow(AgentUriError);
  });

  test("rejects non-semver version", () => {
    expect(() =>
      buildAgentUri({
        pipelineId: "ecc",
        specialist: "intake",
        version: "v1",
      }),
    ).toThrow(AgentUriError);
  });
});

describe("parseAgentUri", () => {
  test("parses canonical form", () => {
    expect(
      parseAgentUri("openclaw://ecc-estimator/agents/intake@0.1.0"),
    ).toEqual({
      pipelineId: "ecc-estimator",
      specialist: "intake",
      version: "0.1.0",
    });
  });

  test("parses prerelease semver", () => {
    expect(
      parseAgentUri("openclaw://ecc/agents/takeoff@1.0.0-rc.1"),
    ).toEqual({
      pipelineId: "ecc",
      specialist: "takeoff",
      version: "1.0.0-rc.1",
    });
  });

  test("throws on missing scheme", () => {
    expect(() => parseAgentUri("ecc/agents/intake@0.1.0")).toThrow(
      AgentUriError,
    );
  });

  test("throws on wrong scheme", () => {
    expect(() => parseAgentUri("file://ecc/agents/intake@0.1.0")).toThrow(
      AgentUriError,
    );
  });

  test("throws on missing version", () => {
    expect(() => parseAgentUri("openclaw://ecc/agents/intake")).toThrow(
      AgentUriError,
    );
  });

  test("throws on missing /agents/ segment", () => {
    expect(() => parseAgentUri("openclaw://ecc/intake@0.1.0")).toThrow(
      AgentUriError,
    );
  });
});

describe("isAgentUri", () => {
  test("accepts canonical and prerelease forms", () => {
    expect(isAgentUri("openclaw://ecc/agents/x@0.1.0")).toBe(true);
    expect(isAgentUri("openclaw://ecc/agents/x@1.0.0-rc.1")).toBe(true);
  });

  test("rejects malformed", () => {
    expect(isAgentUri("not-a-uri")).toBe(false);
    expect(isAgentUri("openclaw://ECC/agents/x@0.1.0")).toBe(false);
    expect(isAgentUri("openclaw://ecc/agents/X@0.1.0")).toBe(false);
  });
});

describe("buildAgentUri / parseAgentUri — roundtrip", () => {
  test("any valid input parses back to the same parts", () => {
    const parts = {
      pipelineId: "ecc-estimator-staging",
      specialist: "vision-manifest",
      version: "0.4.2",
    };
    expect(parseAgentUri(buildAgentUri(parts))).toEqual(parts);
  });
});
