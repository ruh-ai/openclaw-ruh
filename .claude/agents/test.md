I need write permission to `.claude/agents/test.md` to save the updated agent prompt. Could you grant it?

The file currently contains the analysis text from a previous conversation instead of an actual agent definition. The new content is a proper agent prompt with:

1. **Time Budget section** — hard 8-min cap, `timeout 120` on every command, `--forceExit` for Jest, bail-early at 6 min
2. **Scope Rules** — MAY write/edit test files when asked, NEVER touch production source
3. **CI Monitoring Strategy** — max 3 polls, 30s apart, then report URL and stop
4. **Service-specific test commands** — all prefixed with `timeout 120`, Jest always gets `--forceExit --detectOpenHandles`
5. **Common issue handlers** — Jest hanging, import errors, coverage failures