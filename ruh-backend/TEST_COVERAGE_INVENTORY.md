# ruh-backend Test Coverage Inventory

## Overview
Complete source code map of all 51+ TypeScript files in `ruh-backend/src/` with all exported functions, classes, and interfaces for comprehensive test planning.

---

## CORE INFRASTRUCTURE

### 1. Database & Connections
**File:** `db.ts` (49 lines)
- **Exports:**
  - `initPool(dsn?)` — Initialize PostgreSQL connection pool (min 2, max 10)
  - `withConn<T>(fn)` — Transaction wrapper with auto-commit/rollback
- **Dependencies:** pg, @opentelemetry/api
- **Test Type:** Integration (requires Postgres)
- **Key:** All store operations depend on this

### 2. Configuration Management
**File:** `config.ts` (231 lines)
- **Exports:**
  - `BackendConfig` (interface) — All 25 config fields (DB, ports, API keys, OTEL, JWT, etc.)
  - `parseBackendConfig(env, options)` — Parse & validate env vars
  - `getConfig(env, options)` — Get current config (with defaults)
- **Exports:**
  - `parseUrlField()` — Validate HTTP(S) URLs
  - `parseOrigins()` — Parse & normalize CORS origins
  - `parsePort()` — Parse port numbers
  - `parseRequiredString()` — Required string validation
- **Dependencies:** dotenv
- **Test Type:** Unit (no dependencies)
- **Key:** All env validation logic testable in isolation

### 3. Schema Migrations
**File:** `schemaMigrations.ts` (654 lines)
- **Exports:**
  - `SchemaMigration` (interface)
  - `MIGRATIONS` (array of 27 migrations)
  - `runSchemaMigrations()` — Apply pending migrations
  - `ensureSchemaMigrationsLedger()` — Create schema_migrations table
- **Dependencies:** db.ts
- **Test Type:** Integration
- **Key:** 27 migration definitions create 28 tables with 60+ indexes

---

## AUTHENTICATION & AUTHORIZATION

### 4. Auth Tokens
**File:** `auth/tokens.ts` (40 lines)
- **Exports:**
  - `AccessTokenPayload`, `RefreshTokenPayload` (interfaces)
  - `signAccessToken(payload)` — JWT 15m expiry
  - `signRefreshToken(payload)` — JWT 7d expiry
  - `verifyAccessToken(token)` — Parse & validate
  - `verifyRefreshToken(token)` — Parse & validate
- **Dependencies:** jsonwebtoken, config.ts
- **Test Type:** Unit
- **Key:** No external calls; pure JWT handling

### 5. Password Hashing
**File:** `auth/passwords.ts` (10 lines)
- **Exports:**
  - `hashPassword(plaintext)` — bcryptjs with 12 rounds
  - `verifyPassword(plaintext, hash)` — Compare
- **Dependencies:** bcryptjs
- **Test Type:** Unit
- **Key:** Pure crypto operations

### 6. Auth Middleware
**File:** `auth/middleware.ts` (92 lines)
- **Exports:**
  - `AuthUser` (interface) — userId, email, role, orgId
  - `requireAuth(req, res, next)` — Reject 401 if no token
  - `optionalAuth(req, res, next)` — Sets req.user or undefined
  - `requireRole(...roles)` — Middleware factory, rejects 403 if role mismatch
- **Dependencies:** express, tokens.ts
- **Test Type:** Unit (mock express req/res)
- **Key:** All auth checks pass through here

### 7. Builder Access Control
**File:** `auth/builderAccess.ts` (27 lines)
- **Exports:**
  - `requireActiveDeveloperOrg(user)` — Throw 401/403 if no developer org
- **Dependencies:** middleware.ts, orgStore.ts
- **Test Type:** Unit (mock orgStore)

### 8. Customer Access Control
**File:** `auth/customerAccess.ts` (37 lines)
- **Exports:**
  - `requireActiveCustomerOrg(user)` — Throw 401/403 if no customer org with active membership
- **Dependencies:** middleware.ts, organizationMembershipStore.ts, orgStore.ts
- **Test Type:** Unit (mock stores)

### 9. App-Level Access
**File:** `auth/appAccess.ts` (54 lines)
- **Exports:**
  - `AppAccess` (interface) — admin, builder, customer flags
  - `ActiveOrganizationContext`, `ActiveMembershipContext` (interfaces)
  - `deriveAppAccess({platformRole, memberships})` — Calculate access rights
- **Dependencies:** None (pure logic)
- **Test Type:** Unit (no dependencies)

---

## USER & ORGANIZATION MANAGEMENT

### 10. User Store
**File:** `userStore.ts` (140 lines)
- **Exports:**
  - `UserRecord` (interface) — id, email, passwordHash, displayName, avatarUrl, role, orgId, status, emailVerified, timestamps
  - `createUser(email, hash, name, role?, orgId?)` → UserRecord
  - `getUserByEmail(email)` → UserRecord | null
  - `getUserById(id)` → UserRecord | null
  - `listUsers(filters)` → {items, total}
  - `updateUser(id, patch)` → UserRecord | null
  - `deleteUser(id)` → boolean
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration
- **Key:** Core user CRUD

### 11. Organization Store
**File:** `orgStore.ts` (53 lines)
- **Exports:**
  - `OrgRecord` (interface) — id, name, slug, kind (developer|customer), plan, timestamps
  - `createOrg(name, slug, kind?)` → OrgRecord
  - `getOrg(id)` → OrgRecord | null
  - `listOrgs()` → OrgRecord[]
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration

### 12. Organization Membership Store
**File:** `organizationMembershipStore.ts` (120 lines)
- **Exports:**
  - `OrganizationMembershipRecord` (interface) — id, orgId, userId, role, status, org metadata, timestamps
  - `createMembership(orgId, userId, role, status?)` → OrganizationMembershipRecord
  - `listMembershipsForUser(userId)` → OrganizationMembershipRecord[]
  - `getMembershipForUserOrg(userId, orgId)` → OrganizationMembershipRecord | null
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration

### 13. Session Store
**File:** `sessionStore.ts` (88 lines)
- **Exports:**
  - `SessionRecord` (interface) — id, userId, refreshToken, userAgent, ipAddress, activeOrgId, expiresAt, createdAt
  - `createSession(userId, token, userAgent?, ip?, activeOrgId?)` → SessionRecord
  - `getSessionByRefreshToken(token)` → SessionRecord | null
  - `deleteSession(id)` → void
  - `deleteUserSessions(userId)` → void
  - `setActiveOrgId(sessionId, orgId)` → SessionRecord | null
  - `cleanExpiredSessions()` → number (count deleted)
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration

### 14. Auth Identity Store
**File:** `authIdentityStore.ts` (47 lines)
- **Exports:**
  - `AuthIdentityRecord` (interface) — id, userId, provider, subject, createdAt
  - `ensureAuthIdentity(userId, provider, subject)` → AuthIdentityRecord
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration
- **Key:** OAuth identity linking

---

## SANDBOX & RUNTIME MANAGEMENT

### 15. Sandbox Store (Database)
**File:** `store.ts` (134 lines)
- **Exports:**
  - `SandboxRecord` (interface) — sandbox_id, name, state, URLs (dashboard, signed, standard), tokens, gateway/vnc ports, ssh_command, approved, shared_codex_enabled/model, created_at
  - `saveSandbox(result, name?)` → void (upsert)
  - `markApproved(sandboxId)` → void
  - `updateSandboxSharedCodex(sandboxId, enabled, model)` → void
  - `listSandboxes()` → SandboxRecord[]
  - `getSandbox(sandboxId)` → SandboxRecord | null
  - `deleteSandbox(sandboxId)` → boolean (cascades to conversations)
- **Dependencies:** db.ts
- **Test Type:** Integration

### 16. Docker Utilities
**File:** `docker.ts` (161 lines)
- **Exports:**
  - `getContainerName(sandboxId)` → string (format: openclaw-{id})
  - `ManagedSandboxContainer` (interface) — sandbox_id, container_name, state, running, status
  - `shellQuote(value)` → string (safe shell quoting)
  - `joinShellArgs(args)` → string (build shell command)
  - `normalizePathSegment(value)` → string (sanitize path for container)
  - `buildHomeFileWriteCommand(path, content)` → string (create file in $HOME)
  - `buildConfigureAgentCronAddCommand(job)` → string (openclaw cron add)
  - `buildCronDeleteCommand(jobId)` → string (openclaw cron rm)
  - `buildCronRunCommand(jobId)` → string (openclaw cron run)
  - `dockerSpawn(args, timeoutMs)` → [exitCode, output]
  - `dockerExec(containerName, cmd, timeoutMs)` → [success, output]
  - `dockerContainerRunning(containerName, timeoutMs)` → boolean
  - `parseManagedSandboxContainerList(output)` → ManagedSandboxContainer[]
  - `listManagedSandboxContainers(timeoutMs)` → ManagedSandboxContainer[]
- **Dependencies:** Bun.spawn (not Node.js child_process)
- **Test Type:** Unit (mock dockerSpawn/dockerExec)
- **Key:** 12 shell command builders; 4 Docker operations

### 17. Sandbox Manager
**File:** `sandboxManager.ts` (1510 lines) — LARGE
- **Exports:**
  - `SandboxExecResult` (interface)
  - `SandboxRuntimeRequest`, `SandboxRuntimeResponse` (interfaces)
  - `SandboxState` type
  - `SandboxOperationState`, `SandboxOperationError` (interfaces)
  - `SandboxTransitionError` (class extends Error)
  - `SandboxControlPlaneContext` (interface)
  - `ensureSandboxExists(ctx)` → SandboxRecord
  - `getRunningState(ctx)` → string
  - `execInSandbox(ctx, cmd)` → SandboxExecResult
  - `parseSandboxExecOutput(output)` → unknown (JSON)
  - `getSandboxMetadata(ctx)` → metadata object
  - `transitionSandboxState(ctx, targetState)` → void
  - `waitForSandboxReady(ctx, timeoutSecs)` → void
  - `setupSandboxGateway(ctx)` → SandboxExecResult
  - `getGatewayUrl(ctx)` → string
  - `executeAgentScript(ctx, script, args)` → output string
  - Many more sandbox operation methods (~50 functions)
- **Dependencies:** docker.ts, store.ts, sandboxRuntime.ts
- **Test Type:** Integration (requires Docker)
- **Key:** All sandbox lifecycle operations; extremely complex

### 18. Sandbox Runtime
**File:** `sandboxRuntime.ts` (NOT fully read yet)
- **Dependencies:** sandboxManager.ts, config.ts
- **Test Type:** Integration

### 19. Channel Manager
**File:** `channelManager.ts` (183 lines)
- **Exports:**
  - `getChannelsConfig(sandboxId)` → {telegram, slack} config with masked tokens
  - `setTelegramConfig(sandboxId, cfg)` → {ok, logs}
  - `setSlackConfig(sandboxId, cfg)` → {ok, logs}
  - `probeChannelStatus(sandboxId, channel)` → {ok, output}
  - `listPairingRequests(sandboxId, channel)` → {ok, output, codes}
  - `approvePairing(sandboxId, channel, code)` → {ok, output}
- **Dependencies:** docker.ts (via dockerExec)
- **Test Type:** Integration (Docker)
- **Key:** Telegram/Slack gateway config on running containers

---

## AGENTS & CONVERSATIONS

### 20. Agent Store
**File:** `agentStore.ts` (890 lines) — LARGE
- **Exports:**
  - `AgentRecord` (interface) — 30+ fields: id, name, avatar, description, skills, status (active|draft|forging), sandbox_ids, forge_sandbox_id, workflow, triggers, tool_connections, improvements, channels, discovery_documents, workspace_memory, paperclip metadata, timestamps
  - `AgentWorkspaceMemory`, `AgentToolConnectionRecord`, `AgentRuntimeInputRecord`, etc. (11 supporting interfaces)
  - `AgentTriggerRecord`, `AgentImprovementRecord`, `AgentChannelRecord` (interfaces)
  - `AgentCredentialRecord`, `AgentCredentialSummary` (interfaces)
  - `PaperclipWorkerRecord` (interface)
  - `AgentStatus` type
  - `saveAgent(data)` → AgentRecord (create)
  - `listAgents()` → AgentRecord[]
  - `listAgentsForCreator(createdBy)` → AgentRecord[]
  - `listAgentsForCreatorInOrg(createdBy, orgId)` → AgentRecord[]
  - `getAgent(id)` → AgentRecord | null
  - `getAgentForCreator(id, createdBy)` → AgentRecord | null
  - `getAgentForCreatorInOrg(id, createdBy, orgId)` → AgentRecord | null
  - `getAgentOwnership(id)` → {id, createdBy, orgId}
  - `updateAgent(id, patch)` → AgentRecord | null
  - `updateAgentConfig(id, config)` → AgentRecord | null
  - `addSandboxToAgent(agentId, sandboxId)` → AgentRecord | null
  - `removeSandboxFromAgent(agentId, sandboxId)` → AgentRecord | null
  - **Forge lifecycle:** `setForgeSandbox()`, `promoteForgeSandbox()`, `clearForgeSandbox()`
  - `deleteAgent(id)` → boolean
  - **Workspace memory:** `getAgentWorkspaceMemory()`, `updateAgentWorkspaceMemory()`
  - **Credentials:** `saveAgentCredential()`, `deleteAgentCredential()`, `getAgentCredentials()`, `getAgentCredentialSummary()`
  - **Paperclip:** `updatePaperclipMapping()`
  - `getAgentBySandboxId(sandboxId)` → AgentRecord | null
  - ~10 internal normalizer functions (for tool connections, triggers, channels, etc.)
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration
- **Key:** Most complex store; 30+ test cases needed

### 21. Conversation Store
**File:** `conversationStore.ts` (265 lines)
- **Exports:**
  - `ConversationRecord` (interface) — id, sandbox_id, name, model, openclaw_session_key, timestamps, message_count
  - `MessageRecord` (interface) — id?, role, content, workspace_state?, created_at?
  - `ConversationPage`, `MessagePage` (interfaces)
  - `createConversation(sandboxId, model?, name?)` → ConversationRecord
  - `listConversations(sandboxId)` → ConversationRecord[]
  - `listConversationsPage(sandboxId, {limit, cursor})` → ConversationPage
  - `getConversation(convId)` → ConversationRecord | null
  - `getConversationForSandbox(convId, sandboxId)` → ConversationRecord | null
  - `getMessages(convId)` → MessageRecord[]
  - `getMessagesPage(convId, {limit, before})` → MessagePage
  - `appendMessages(convId, messages)` → boolean
  - `renameConversation(convId, name)` → boolean
  - `deleteConversation(convId)` → boolean (cascades messages)
  - Internal cursor encoding/decoding
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration

### 22. Conversation Access
**File:** `conversationAccess.ts` (NOT fully read)
- **Dependencies:** conversationStore.ts, auth
- **Test Type:** Unit/Integration

### 23. Chat Persistence
**File:** `chatPersistence.ts` (458 lines)
- **Exports:**
  - `PersistedChatExchangeMessage` (interface) — role, content, workspace_state?
  - `ExecutionSummary` (interface)
  - `getPersistedUserMessage(messages)` → PersistedChatExchangeMessage | null
  - `getPersistedAssistantMessageFromResponse(payload)` → PersistedChatExchangeMessage | null
  - `StreamingChatPersistenceCollector` (class)
    - `consumeLine(line)` — Parse SSE stream lines
    - `hasCompleted()` → boolean
    - `buildAssistantMessage()` → PersistedChatExchangeMessage | null
    - `buildExecutionSummary()` → ExecutionSummary | null
- **Dependencies:** validation.ts (types)
- **Test Type:** Unit
- **Key:** SSE stream parsing; task/browser workspace extraction

---

## COST TRACKING & BUDGET

### 24. Cost Store
**File:** `costStore.ts` (298 lines)
- **Exports:**
  - `CostEvent` (interface) — id, agent_id, worker_id?, task_id?, run_id?, model, input_tokens, output_tokens, cost_cents, created_at
  - `CreateCostEventInput`, `CostEventListResult`, `MonthlySummary` (interfaces)
  - `BudgetPolicy`, `BudgetStatus` (interfaces)
  - `createCostEvent(input)` → CostEvent
  - `listCostEvents(agentId, {limit?, offset?, run_id?})` → CostEventListResult
  - `getMonthlySummary(agentId, month?)` → MonthlySummary
  - `upsertBudgetPolicy(input)` → BudgetPolicy
  - `getBudgetPolicy(agentId, workerId?)` → BudgetPolicy | null
  - `getBudgetStatus(agentId, workerId?)` → BudgetStatus
  - Internal serializers
- **Dependencies:** db.ts, crypto (randomUUID)
- **Test Type:** Integration

### 25. Cost Routes
**File:** `costRoutes.ts` (NOT fully read)
- **Dependencies:** costStore.ts, Express
- **Test Type:** Integration

---

## MARKETPLACE

### 26. Marketplace Store
**File:** `marketplaceStore.ts` (586 lines)
- **Exports:**
  - `MarketplaceListingRecord`, `MarketplaceReviewRecord`, `MarketplaceInstallRecord`, `AgentVersionRecord` (interfaces)
  - `MarketplaceListingStatus`, `MarketplaceListingCategory` (types)
  - Create, read, update operations for listings, reviews, installs, versions
  - `publishListing()`, `reviewListing()`, `installListing()`
  - `listLatestVersionForAgent(agentId)` → AgentVersionRecord | null
- **Dependencies:** db.ts, uuid
- **Test Type:** Integration

### 27. Marketplace Routes
**File:** `marketplaceRoutes.ts` (524 lines)
- **Exports:** Express Router
- **Routes:** GET/POST/PATCH for marketplace CRUD
- **Dependencies:** Express, marketplaceStore.ts, auth middleware
- **Test Type:** Integration

### 28. Marketplace Runtime
**File:** `marketplaceRuntime.ts` (345 lines)
- **Exports:** Functions for installing agents from marketplace
- **Dependencies:** marketplaceStore.ts, agentStore.ts
- **Test Type:** Integration

---

## AUDIT & EVENTS

### 29. Audit Store
**File:** `auditStore.ts` (151 lines)
- **Exports:**
  - `AuditEventRecord` (interface) — event_id, occurred_at, request_id?, action_type, target_type, target_id, outcome, actor_type, actor_id, origin?, details
  - `WriteAuditEventInput` (interface)
  - `AuditEventFilters` (interface)
  - `writeAuditEvent(input)` → void
  - `listAuditEvents(filters)` → AuditEventListResult
  - `sanitizeAuditDetails(value)` — Remove sensitive keys
  - Internal sanitizer functions
- **Dependencies:** db.ts, crypto (randomUUID)
- **Test Type:** Integration
- **Key:** SENSITIVE_KEY_PATTERN filters token/secret/key/password fields

### 30. System Event Store
**File:** `systemEventStore.ts` (NOT fully read)
- **Test Type:** Integration

---

## UTILITIES & HELPERS

### 31. Utils
**File:** `utils.ts` (63 lines)
- **Exports:**
  - `httpError(status, detail)` → Error & {status}
  - `gatewayUrlAndHeaders(record, path)` → [url, headers]
  - `parseJsonOutput(output)` → unknown (finds JSON in output)
  - `syntheticModels()` → {object, data} (mock model list)
- **Dependencies:** None (pure utilities)
- **Test Type:** Unit

### 32. Validation
**File:** `validation.ts` (944 lines)
- **Exports:**
  - 30+ type definitions for workspace state structures
  - `PersistedWorkspaceState`, `PersistedBrowserWorkspaceState`, `PersistedTaskWorkspaceState` (interfaces)
  - Various validators and type guards
- **Dependencies:** None
- **Test Type:** Unit

### 33. Credentials
**File:** `credentials.ts` (88 lines)
- **Exports:**
  - `EncryptedBlob` (interface) — encrypted, iv
  - `encryptCredentials(plain)` → EncryptedBlob (AES-256-GCM)
  - `decryptCredentials(encrypted, iv)` → {[key]: value}
- **Dependencies:** crypto (createCipheriv, createDecipheriv, randomBytes), config.ts
- **Test Type:** Unit
- **Key:** Master key from AGENT_CREDENTIALS_KEY env var (64 hex chars)

### 34. Telemetry
**File:** `telemetry.ts` (73 lines)
- **Exports:**
  - `initTelemetry(config)` — Initialize OTEL if enabled
  - `shutdownTelemetry()` — Flush & shutdown
  - `getTracer(name?)` → Tracer
- **Dependencies:** @opentelemetry/*, config.ts
- **Test Type:** Unit (mock tracer)
- **Key:** No-op when OTEL disabled; zero overhead

### 35. Request Logger
**File:** `requestLogger.ts` (58 lines)
- **Exports:**
  - `requestLoggerMiddleware(req, res, next)` — Log HTTP request/response with latency
- **Dependencies:** Express, @ruh/logger
- **Test Type:** Unit (mock Express objects)

### 36. Backend Readiness
**File:** `backendReadiness.ts` (30 lines)
- **Exports:**
  - `BackendReadinessStatus` type
  - `BackendReadinessSnapshot` (interface)
  - `getBackendReadiness()` → BackendReadinessSnapshot
  - `markBackendReady()` → void
  - `markBackendNotReady(reason?)` → void
- **Dependencies:** None
- **Test Type:** Unit

### 37. Agent Tracing
**File:** `agentTracing.ts` (NOT fully read)
- **Test Type:** Unit

### 38. Skill Registry
**File:** `skillRegistry.ts` (162 lines)
- **Exports:**
  - `SkillRegistryEntry` (interface) — skill_id, name, description, tags, skill_md
  - `listSkills()` → SkillRegistryEntry[]
  - `findSkill(skillId)` → SkillRegistryEntry | null
  - Hardcoded list of 6 skills (skill-creator, slack-reader, web-scraper, github-pr-fetcher, email-sender, http-fetch)
- **Dependencies:** None
- **Test Type:** Unit

---

## ROUTES & MAIN APP

### 39. Auth Routes
**File:** `authRoutes.ts` (637 lines)
- **Exports:** Express Router with auth endpoints
- **Routes:**
  - POST /auth/signup — User registration
  - POST /auth/login — User login
  - POST /auth/refresh — Refresh token
  - POST /auth/logout — Logout
  - GET /auth/me — Get current user
  - And more auth operations
- **Dependencies:** Express, auth modules, userStore.ts, sessionStore.ts
- **Test Type:** Integration

### 40. Main App
**File:** `app.ts` (3769 lines) — MASSIVE
- **Exports:**
  - `app` — Express application
  - All routes and middleware setup
- **Routes:** 100+ endpoints across:
  - Health checks (/health, /ready)
  - Sandbox operations
  - Agent operations
  - Conversations
  - Marketplace
  - Cost tracking
  - Audit logs
  - Workspace files
  - Webhooks
  - Middleware: CORS, body parsing, auth, logging, OTEL
- **Dependencies:** All other modules
- **Test Type:** Integration
- **Key:** Needs comprehensive route testing

### 41. Startup
**File:** `startup.ts` (111 lines)
- **Exports:**
  - `StartupLogger` (interface)
  - `StartupDependencies` (interface) — Allows DI for testing
  - `runPreflight(logger, checkDocker, config)` — Validate Docker, LLM keys
  - `startBackend(deps)` — Initialize: telemetry → pool → migrations → listen
  - `defaultCheckDocker()`, `defaultListen()` (helpers)
- **Dependencies:** config.ts, db.ts, schemaMigrations.ts, app.ts, telemetry.ts
- **Test Type:** Unit (with DI)
- **Key:** testable startup flow

### 42. Index (Entry Point)
**File:** `index.ts` (20 lines)
- **Exports:** Loads dotenv, calls startBackend()
- **Test Type:** Integration

---

## SPECIALIZED MODULES

### 43. VNC Proxy
**File:** `vncProxy.ts` (NOT fully read)
- **Test Type:** Integration

### 44. Paperclip Client
**File:** `paperclipClient.ts` (229 lines)
- **Exports:** Functions for Paperclip integration
- **Dependencies:** HTTP client
- **Test Type:** Integration (requires API)

### 45. Paperclip Orchestrator
**File:** `paperclipOrchestrator.ts` (260 lines)
- **Exports:** Orchestration logic for Paperclip workers
- **Dependencies:** paperclipClient.ts
- **Test Type:** Integration

### 46. OpenSpace Client
**File:** `openspaceClient.ts` (213 lines)
- **Exports:** OpenSpace MCP client operations
- **Dependencies:** HTTP client
- **Test Type:** Integration

### 47. Workspace Files
**File:** `workspaceFiles.ts` (517 lines)
- **Exports:** Sandbox workspace file operations
- **Dependencies:** sandboxManager.ts
- **Test Type:** Integration

### 48. Webhook Delivery
**File:** `webhookDeliveryStore.ts` (NOT fully read)
- **Test Type:** Integration

### 49. Execution Recording
**File:** `executionRecordingStore.ts` (NOT fully read)
- **Test Type:** Integration

### 50. Eval Result Store
**File:** `evalResultStore.ts` (NOT fully read)
- **Test Type:** Integration

### 51. Agent Version Store
**File:** `agentVersionStore.ts` (NOT fully read)
- **Test Type:** Integration

### 52. Test User Seed
**File:** `testUserSeed.ts` (394 lines)
- **Exports:** Functions to create test users in dev mode
- **Test Type:** Test helper

### 53. Demo Marketplace Seed
**File:** `demoMarketplaceSeed.ts` (467 lines)
- **Exports:** Functions to seed demo marketplace listings
- **Test Type:** Test helper

---

## TEST COVERAGE SUMMARY

### By Category

| Category | Files | Test Type | Complexity |
|----------|-------|-----------|-----------|
| Core Infrastructure | 3 | Integration | Medium |
| Auth & Access | 5 | Unit/Integration | High |
| User & Org | 4 | Integration | Medium |
| Sandbox/Runtime | 4 | Integration | **Very High** |
| Agents | 2 | Integration | **Very High** |
| Conversations | 3 | Integration | High |
| Cost Tracking | 2 | Integration | Medium |
| Marketplace | 3 | Integration | High |
| Audit & Events | 2 | Integration | Medium |
| Utilities | 5 | Unit | Low |
| Routes & Main | 3 | Integration | **Critical** |
| Specialized | 11 | Mixed | High |
| **TOTAL** | **51+** | — | — |

### Unit-Testable (No DB/Docker)
1. config.ts (25 tests)
2. auth/tokens.ts (8 tests)
3. auth/passwords.ts (4 tests)
4. auth/middleware.ts (6 tests)
5. auth/appAccess.ts (5 tests)
6. utils.ts (6 tests)
7. credentials.ts (6 tests)
8. validation.ts (20 tests)
9. skillRegistry.ts (4 tests)
10. backendReadiness.ts (3 tests)
11. chatPersistence.ts (15 tests)
12. **Subtotal: ~110 unit tests**

### Integration-Required (DB/Docker)
1. db.ts (5 tests)
2. schemaMigrations.ts (3 tests)
3. userStore.ts (10 tests)
4. orgStore.ts (5 tests)
5. organizationMembershipStore.ts (5 tests)
6. sessionStore.ts (8 tests)
7. authIdentityStore.ts (3 tests)
8. store.ts (8 tests)
9. agentStore.ts (35 tests) — **LARGEST**
10. conversationStore.ts (12 tests)
11. costStore.ts (10 tests)
12. auditStore.ts (8 tests)
13. marketplaceStore.ts (15 tests)
14. docker.ts (12 tests) — Unit but needs mock
15. sandboxManager.ts (25 tests) — **MOST COMPLEX**
16. channelManager.ts (8 tests)
17. authRoutes.ts (20 tests)
18. app.ts (100+ tests) — **CRITICAL**
19. startup.ts (8 tests)
20. All other integration files (30+ tests)
21. **Subtotal: 350+ integration tests**

---

## KEY DEPENDENCIES GRAPH

```
app.ts
├── authRoutes.ts
│   ├── auth/middleware.ts
│   │   └── auth/tokens.ts
│   ├── auth/passwords.ts
│   ├── userStore.ts → db.ts
│   ├── sessionStore.ts → db.ts
│   └── ...
├── All store files → db.ts
├── sandboxManager.ts
│   ├── docker.ts
│   ├── store.ts → db.ts
│   └── sandboxRuntime.ts
├── agentStore.ts → db.ts
├── conversationStore.ts → db.ts
├── telemetry.ts
├── requestLogger.ts
└── middleware stack

startup.ts
├── config.ts
├── db.ts
├── schemaMigrations.ts → db.ts
├── app.ts (all above)
└── telemetry.ts
```

---

## CRITICAL TEST SCENARIOS

### Must Test
1. **Auth flow:** signup → login → token refresh → logout
2. **Sandbox lifecycle:** create → setup → execute → delete
3. **Agent CRUD:** create → update → promote from forge → delete
4. **Conversation persistence:** create → append messages → pagination
5. **Cost tracking:** create events → budget policy → utilization calculations
6. **Marketplace:** publish → review → install → update version
7. **Access control:** builder vs customer org enforcement
8. **Channel config:** Telegram & Slack setup, token masking
9. **Docker operations:** container spawn, exec, state queries
10. **Error handling:** all 400/401/403/500 paths

### High-Value Tests
- Concurrent sandbox operations
- Transaction rollback on errors
- Pagination cursors (conversation/cost)
- JSON normalizers in agentStore
- Credential encryption/decryption
- Audit event sanitization
- SSE stream parsing in chatPersistence

