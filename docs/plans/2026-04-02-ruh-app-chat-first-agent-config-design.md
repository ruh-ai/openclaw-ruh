# Ruh App Chat-First Agent Config Design

## Goal

Make the Flutter customer runtime feel like one coherent workspace:

- `Open agent` should take the user directly into live chat
- the same runtime surface should also expose `Terminal`, `Files`, `Browser`, and `Agent Config`
- `Agent Config` should show the persisted setup from creation and allow safe runtime edits without handing customer sessions the builder's full authoring powers

## Chosen Approach

Use the existing chat surface as the primary customer destination and retire the old detail page as a primary stop. The detail route becomes compatibility framing only, while the real runtime center of gravity moves to `ChatScreen`.

The config experience should be embedded as a fourth workspace tab inside `ComputerView`. That keeps chat plus runtime observability plus agent tuning in one place instead of bouncing the user between separate pages.

## Why This Approach

This is the smallest change that matches the intended product shape:

- no more dead-end detail page before work can start
- no duplication between a detail page and a config page
- runtime config lives beside runtime evidence
- customer-safe editing stays separate from builder-only metadata mutation

## Backend Shape

Do not widen the builder routes. Add a dedicated customer-safe runtime-config seam:

- `GET /api/agents/:id/customer-config`
- `PATCH /api/agents/:id/customer-config`

That route should expose only the parts customers can safely operate on now:

- editable: `name`, `description`, `agentRules`, runtime-input `value`s
- readable snapshot: `skills`, `toolConnections`, `triggers`, `channels`, `workspaceMemory`, optional `creationSession`

Workspace memory can continue to persist through the existing dedicated route if that keeps the implementation cleaner.

## Flutter Shape

- installed-agent cards should launch and go straight to `/chat/:agentId`
- `ComputerView` gets a new `Agent Config` tab
- `ChatScreen` should support an initial workspace tab so `/agents/:id` can open the same runtime surface with config preselected
- the config UI should use section-level editing and save feedback rather than one giant unstructured form

## Scope For First Pass

Editable:

- name
- description
- agent rules
- runtime input values
- workspace memory

Read-only:

- skills
- tool connections
- triggers
- channels
- runtime status/deployment summary
- creation-session snapshot

This is the right first boundary because it ships meaningful operator control without turning the customer app into a second builder.

## Risks

- customer-owned agent mutation currently assumes builder-style ownership checks, so the new contract must fail closed on active customer org
- `creation_session` is flexible JSON, so the UI should summarize it defensively
- route changes can easily break deep links if `/agents/:id` is removed outright instead of being repurposed

## Success Criteria

- opening an installed agent lands directly in chat
- the same screen exposes `Terminal`, `Files`, `Browser`, and `Agent Config`
- config loads from live backend data
- safe edits persist and survive refresh
- old `/agents/:id` links still land on the runtime surface
