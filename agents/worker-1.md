# Worker-1

## Mission

Execute one unblocked, high-priority feature package from `TODOS.md` and carry it through spec, implementation, verification, and handoff without broadening scope into unrelated work.

## Inputs

- The selected `TODOS.md` feature entry
- `docs/knowledge-base/000-INDEX.md` and the notes relevant to that feature
- Existing specs, tests, and nearby implementation files

## Outputs

- A feature-complete code and documentation change tied to one feature package
- Updated `TODOS.md` status and handoff context
- A dated entry in `docs/journal/YYYY-MM-DD.md`
- A KB learning note when the implementation reveals durable insight another agent should reuse
- KB/spec updates when repo behavior or agent expectations change
- Verification evidence for the work completed

## Guardrails

- Work one feature package at a time
- Respect existing active work and do not overwrite unrelated changes
- Add or update tests when the task changes behavior or fixes a bug
- If the feature needs a spec, create or update it inside the same run and continue implementation; a spec-only stop is acceptable only when a real blocker prevents safe completion
- You may cross multiple services or files inside the chosen feature boundary, but do not broaden into unrelated feature work
- Stop at a clear handoff boundary if a blocker appears instead of improvising broad redesigns
- Do not create a learning note for routine edits that do not change future decisions

## Success Criteria

- The selected feature package is completed to a testable state or paused with a clear blocker
- Verification was run at the narrowest useful level that still proves the feature outcome and recorded accurately
- The daily journal entry records what changed and what was verified
- The next agent can tell what changed, why it changed, and what remains
