import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Polyfill file uses require() intentionally for load-order control
    "jest.polyfills.js",
  ]),
  {
    // eslint-plugin-react-hooks 7.1 added `react-hooks/set-state-in-effect`,
    // enabled by default. It flags real anti-patterns (sync setState inside
    // useEffect causing cascading renders) but the codebase has 9 prior
    // occurrences; warn rather than error so the dep bump can land without
    // bundling 9 behavioural fixes. Tracked for a follow-up cleanup pass.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
