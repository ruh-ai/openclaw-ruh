# Marketplace Customer Runtime Install Design

> Approved implementation direction captured before code changes.

## Goal

Turn marketplace install into a real customer runtime flow: install creates a customer-scoped runtime agent, and first open provisions that agent's own sandbox/gateway instead of reusing builder-owned agents or listing metadata.

## Recommended Approach

Use a per-user customer runtime agent model scoped by `(listing_id, org_id, user_id)`.

- keep the org gate intact by requiring an active customer org for install and launch
- create a real `agents` row for the installed runtime so the customer app can reuse existing agent/chat primitives
- persist a published runtime snapshot in `agent_versions.snapshot`
- provision the sandbox lazily on first open, using the stored snapshot/config already copied onto the installed runtime agent

## Why This Approach

- It gives each user a private gateway without weakening tenant isolation.
- It reuses the existing `agents`, sandbox, and chat surface area instead of inventing a second runtime model.
- It lets the current marketplace listing remain a catalog object instead of pretending it is itself a runnable agent instance.

## Initial Scope

1. Persist a runnable published snapshot for agent listings.
2. Create a customer runtime install record that points to a real installed `agents` row.
3. Branch customer-facing `/api/agents` reads on active customer org context.
4. Add a first-open launch endpoint that provisions/configures a sandbox for the installed runtime agent.
5. Update `ruh_app` marketplace and workspace flows to use the real installed runtime and open chat against its sandbox.

## Deferred

- seat assignment and shared team runtimes
- paid checkout and entitlement lifecycle
- typed non-agent marketplace items
