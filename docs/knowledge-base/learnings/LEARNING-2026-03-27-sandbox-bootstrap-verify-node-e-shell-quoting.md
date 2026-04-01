# LEARNING: Shell-safe `node -e` verification in sandbox bootstrap

[[000-INDEX|← Index]] | [[003-sandbox-lifecycle]] | [[SPEC-sandbox-bootstrap-config-apply-contract]]

## Date

2026-03-27

## Context

While reproducing the failed `Simple Helper Agent` deploy, sandbox creation consistently reached `Gateway is listening!` and then died during `Verifying required bootstrap config...`, leaving no persisted sandbox record and surfacing a generic frontend recovery error (`Connection lost and no sandbox found — try again`).

## What Happened

`verifyBootstrapConfig()` built its verification command as:

- `docker exec ... bash -c "node -e ${JSON.stringify(multilineScript)} ..."`

Because the script payload came from `JSON.stringify()` on a multiline template literal, the shell passed literal `\n` escape sequences into `node -e` instead of real newlines. Inside the container, Node saw a script beginning with `\nconst fs = ...` and exited before the verification read could run. That meant sandbox creation failed before `result`, so `saveSandbox()` never executed and the deploy page could only report a broken stream with no sandbox to recover.

## Takeaway

When running JavaScript through `node -e` inside `docker exec ... bash -c`, do not pass JSON-stringified multiline scripts directly. Use a shell-safe one-line script, base64/eval transport, or another encoding that avoids literal newline escapes reaching Node.

## Reuse

- If a sandbox-create stream dies late in bootstrap with no `result`, inspect the verification command itself before assuming a runtime-config mismatch.
- If a `node -e` command prints `[eval]:1 \nconst ...`, treat it as shell quoting/escaping failure first, not as application logic failure.

## Related Notes

- [[003-sandbox-lifecycle]] — sandbox creation only persists on `result`, so verification-command failures look like missing sandboxes to the UI
- [[SPEC-sandbox-bootstrap-config-apply-contract]] — the verification read is intentionally fail-closed and must itself be transported safely
