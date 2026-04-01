# LEARNING: Existing-agent deploy entry points still diverge between save and real deployment

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Context

During a live localhost:3001 verification run for the existing `Simple Helper Agent`, the goal was to perform a real first deployment from the current Agent Builder UI rather than reason from code alone.

## What Was Learned

There are two distinct deploy entry points for an existing saved agent, and they do not currently mean the same thing.

- In Improve Agent Co-Pilot mode (`/agents/create?agentId=...`), the prominent CTA still reads `Deploy Agent`, but the existing-agent branch in `agent-builder-ui/app/(platform)/agents/create/page.tsx` only persists metadata/config changes and routes back to `/agents`. It does not redirect into the dedicated deploy page and it does not start sandbox creation.
- The real deploy behavior lives on `agent-builder-ui/app/(platform)/agents/[id]/deploy/page.tsx`. That page does call `POST /api/sandboxes/create`, stream sandbox-create SSE progress, and later attach the sandbox back to the agent after config apply succeeds.
- Direct navigation to `/agents/[id]/deploy` can briefly render `Agent not found.` even when the backend lookup works, because the page reads `agents.find(...)` from the client store before the async `fetchAgent(id)` hydration finishes. Once the store catches up, the same page recovers and renders the saved agent normally.
- For the `Simple Helper Agent`, the dedicated deploy page successfully started provisioning, created container `openclaw-8254f2f2-047d-4545-b85a-8ba083d43dcb`, completed OpenClaw install plus browser/VNC/bootstrap/gateway setup, and still ended with `Connection lost and no sandbox found — try again`. The agent record remained at `sandboxes: []` and the temporary container disappeared afterward, so manual verification needs to key off persisted sandbox attachment or an explicit success state, not the initial button click.

## Evidence

- Playwright run against `http://localhost:3001/agents/create?agentId=3d72095d-8077-46e6-9085-354dcec75ab5` showed the Co-Pilot `Deploy Agent` button issuing only `PATCH /api/agents/:id` and `PATCH /api/agents/:id/config`, followed by a route back to `/agents`.
- Playwright run against `http://localhost:3001/agents/3d72095d-8077-46e6-9085-354dcec75ab5/deploy` showed an initial `Agent not found.` render, then a recovered deploy page after `GET /api/agents/3d72095d-8077-46e6-9085-354dcec75ab5` hydrated the store.
- The same deploy page issued `POST /api/sandboxes/create` and logged SSE progress through OpenClaw install, browser/VNC dependency install, shared Codex seeding, bootstrap config, and gateway health checks before failing with `Connection lost and no sandbox found — try again`.
- `curl http://localhost:8000/api/agents/3d72095d-8077-46e6-9085-354dcec75ab5 | jq` still returned `sandboxes: []` after that failure.
- `docker exec openclaw-8254f2f2-047d-4545-b85a-8ba083d43dcb ps -eo pid,etime,cmd` showed the live provisioning work inside the container (`apt-get install ... xvfb x11vnc websockify novnc chromium ...`).
- `docker ps -a --format '{{.Names}}\t{{.Status}}' | rg '8254f2f2|openclaw-'` no longer showed the temporary container after the failure surfaced.

## Implications For Future Agents

- Treat the existing-agent Co-Pilot `Deploy Agent` CTA as a save/apply action until its label or behavior is brought in line with the dedicated deploy route.
- When verifying deploy manually, prefer the real `/agents/[id]/deploy` page and wait for either persisted sandbox attachment or an explicit success state before calling the agent deployed.
- The deploy page needs a loading state for store hydration; a transient `Agent not found.` on direct entry is misleading because the backend fetch may already be succeeding.
- Slow first-deploy runs are not necessarily broken immediately; browser/VNC dependency installation can outlast the page copy that claims deployment takes about 60 seconds, but this run shows the later bootstrap/gateway phase can still collapse into a no-record failure even after those installs finish.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [Journal entry](../../journal/2026-03-27.md)
