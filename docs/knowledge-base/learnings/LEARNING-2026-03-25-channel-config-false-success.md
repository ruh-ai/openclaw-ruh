# LEARNING: Channel config saves currently report false success

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[006-channel-manager]] | [[009-ruh-frontend]]

## Context

While reviewing the current repo state for the next highest-leverage missing backlog item, the existing active tasks were compared against the live Telegram/Slack configuration path in `ruh-backend` and `ruh-frontend`.

## What Was Learned

- The backend channel-config helpers do not have a truthful apply contract today.
- `setTelegramConfig()` and `setSlackConfig()` record `✓` or `✗` logs for individual `openclaw config set` calls, but they still return `{ ok: true, logs }` unconditionally.
- The gateway-restart helper does not surface whether the stop/start commands actually succeeded, so a failed restart can still be reported as `✓ Gateway restarted`.
- `ChannelsPanel` treats any HTTP `200` as success, shows a green "Saved — gateway restarted" state, and clears the newly entered secret fields even when the backend logs indicate failure.
- Existing backlog items cover shell safety, backend auth, audit logging, and `configure-agent` fail-closed deploys, but none define the channel-config apply truthfulness contract itself.

## Evidence

- [`ruh-backend/src/channelManager.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/channelManager.ts#L90) appends per-step `✓/✗` logs in `setTelegramConfig()` and still returns `ok: true` after an unconditional `restartGateway()` call.
- [`ruh-backend/src/channelManager.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/channelManager.ts#L114) does the same for `setSlackConfig()`.
- [`ruh-frontend/components/ChannelsPanel.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-frontend/components/ChannelsPanel.tsx#L52) hard-codes the success copy "Saved — gateway restarted" for the saved state.
- [`ruh-frontend/components/ChannelsPanel.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-frontend/components/ChannelsPanel.tsx#L399) and [`ruh-frontend/components/ChannelsPanel.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-frontend/components/ChannelsPanel.tsx#L540) set the saved state for any `res.ok` response and clear the entered secret fields immediately afterward.
- `TODOS.md` already tracks `TASK-2026-03-25-24` for `configure-agent` fail-closed deploys and `TASK-2026-03-25-14` for shell-safe command construction, but neither task covers truthful success/failure reporting for channel saves.

## Implications For Future Agents

- Treat channel configuration as a control-plane apply contract, not as a best-effort form post.
- Keep shell-safety work and truthful save semantics distinct: escaping protects command construction, while this gap is about whether the product can accurately tell the user the save worked.
- If a post-save probe is added, separate "config write failed", "restart failed", and "provider still disconnected after a successful apply" so operators get actionable recovery guidance.

## Links

- [[004-api-reference]]
- [[006-channel-manager]]
- [[009-ruh-frontend]]
- [Journal entry](../../journal/2026-03-25.md)
