import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("sandbox image keeps agent-runtime install scripts enabled for native deps", () => {
  const dockerfile = readFileSync(
    join(import.meta.dir, "..", "..", "Dockerfile.sandbox"),
    "utf8",
  );

  expect(dockerfile).toContain("COPY agent-runtime/package.json agent-runtime/package-lock.json* ./");
  expect(dockerfile).toContain("RUN npm ci");
  expect(dockerfile).not.toContain("npm ci --ignore-scripts");
});

test("docker build context excludes agent-runtime host artifacts that can overwrite Linux deps", () => {
  const dockerignore = readFileSync(
    join(import.meta.dir, "..", "..", "..", ".dockerignore"),
    "utf8",
  );

  expect(dockerignore).toContain("agent-runtime/node_modules/");
  expect(dockerignore).toContain("agent-runtime/.next/");
});
