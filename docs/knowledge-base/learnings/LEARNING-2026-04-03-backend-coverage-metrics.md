# LEARNING: Backend coverage metrics are weighted LCOV, not Bun's file-average summary

[[000-INDEX|← Index]] | [[002-backend-overview|Backend Overview]] | [[013-agent-learning-system|Agent Learning System]] | [[LEARNING-2026-04-02-backend-coverage-stabilization|Previous backend coverage learning]]

## Context

While extending backend coverage on 2026-04-03, the full packaged run stayed far below threshold even though Bun's text reporter printed a much higher `All files` percentage. I reran `cd ruh-backend && bun run test:coverage`, inspected `coverage/lcov.info`, and compared the numbers directly.

## What Was Learned

- Bun's text reporter `All files` row is the simple mean of per-file percentages, not the weighted global coverage percentage.
- `scripts/check-coverage.ts` is enforcing the weighted LCOV totals, which are the numbers that matter for the real threshold gate.
- For this repo state on 2026-04-03:
  - An earlier stable slice showed Bun text reporter at `87.56%` lines / `87.42%` functions while the packaged LCOV gate showed `54.69%` lines (`7783/14232`) / `74.95%` functions (`808/1078`).
  - After the later `agentStore` + `billingStore` + `docker` follow-up, Bun text reporter moved to `88.78%` lines / `88.03%` functions while the packaged LCOV gate only moved to `57.31%` lines (`8612/15028`) / `77.20%` functions (`894/1158`).
- Small perfect suites can look impressive in Bun's text summary but barely move the weighted gate if the uncovered denominator is still concentrated in large files like `app.ts`.
- Query-string imports are useful for Bun mock isolation, but they are a poor default for modules where coverage attribution must land on the canonical source file. `openspaceClient.ts` and `paperclipClient.ts` only started reporting their real coverage once the tests imported the canonical module path.
- The same pattern held for `docker.ts`: a broader helper suite that still used a query-string import was stable and valuable as a regression suite, but it barely changed the canonical file's LCOV totals.
- Cross-file `mock.module()` overrides of shared modules are especially dangerous in coverage work. A temporary `paperclipOrchestrator` test suite had to be removed because its mocks for `paperclipClient` and `openspaceClient` interfered with the standalone client suites during the full Bun run.

## Evidence

- Weighted-versus-average comparison:
  - Simple mean across file percentages from `coverage/lcov.info`: `87.56%` lines, `87.42%` functions
  - Weighted totals from the same LCOV artifact: `54.69%` lines, `74.95%` functions
- Stable coverage-improving slice shipped in this run:
  - `ruh-backend/tests/unit/marketplaceRuntime.test.ts`
  - `ruh-backend/tests/unit/openspaceClient.test.ts`
  - `ruh-backend/tests/unit/paperclipClient.test.ts`
  - `ruh-backend/tests/unit/evalResultStore.test.ts`
- The full packaged verification command remained:
  - `cd ruh-backend && bun run test:coverage`

## Implications For Future Agents

- Treat `bun run test:coverage` as the source of truth for backend coverage health, not Bun's printed `All files` row.
- Prioritize the largest weighted offenders first. In this repo state, `app.ts`, `marketplaceRoutes.ts`, `agentStore.ts`, `paperclipOrchestrator.ts`, and `vncProxy.ts` will move the threshold far more than another perfect small-file suite.
- Use canonical imports for modules where coverage attribution matters, and reserve query-string imports for cases where Bun cache isolation is strictly necessary.
- Avoid adding coverage suites that `mock.module()` a shared dependency already exercised by another standalone suite in the same run unless the dependency surface is fully isolated. If the mocks collide, prefer a smaller stable slice over a large but flaky one.

## Links

- [[002-backend-overview]]
- [[013-agent-learning-system]]
- [[LEARNING-2026-04-02-backend-coverage-stabilization]]
- [Journal entry](../../journal/2026-04-03.md)
