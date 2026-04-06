# Hermes Hot Memory

## Agent Scores (2026-04-02)

| Agent | Tasks | Pass% | Notes |
|-------|-------|-------|-------|
| analyst | 9 | 100% | Reliable decomposer |
| test | 28 | 82% | Solid, some timeout issues with Jest |
| backend | 21 | 67% | Needs improvement — complex tasks timeout |
| frontend | 8 | 63% | Struggles with large multi-file changes |
| flutter | 3 | 33% | Low sample, 2 failures on widget tests |
| reviewer | 0 | - | First tasks submitted 2026-04-02 |
| sandbox | 0 | - | First tasks submitted 2026-04-02 |
| strategist | 0 | - | First tasks submitted 2026-04-02 |

## Active Patterns

- Backend tasks >600s frequently timeout — keep task scope narrow
- Flutter widget tests need proper Riverpod provider overrides; mock setup is complex
- Frontend multi-file changes (36 hardcoded colors, 3 Alive Additions) are too broad — split into atomic tasks
- Jest hangs: always use `--forceExit --detectOpenHandles`, prefix with `timeout 120`
- Analyst produces high-quality decompositions — 100% pass rate

## Active Pitfalls

- Memory context injection makes prompts very long — can cause agent confusion on retry
- Dedup hash doesn't account for goal context — similar descriptions across goals get deduped
- Tasks marked "running" can get stuck if execution subprocess dies — need periodic cleanup

## Prasanjit Preferences

- Prefers autonomous background work over interactive step-by-step
- Values Mission Control dashboard for monitoring
- Wants all agents exercised and improving, not just backend/test
- Google Ads agent is the proving case for the platform

## Infrastructure

- Hermes backend: launchd `ai.ruh.hermes-backend` (port 8100)
- Mission Control: launchd `ai.ruh.hermes-mission-control` (port 3333, production build)
- Redis: Docker `hermes-redis` (port 6379, auto-restart)
- PostgreSQL: Docker `pg` (port 5432, databases: openclaw + hermes)
