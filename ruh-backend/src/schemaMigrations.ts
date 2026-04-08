import { withConn } from './db';

export interface SchemaMigration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: SchemaMigration[] = [
  {
    id: '0001_base_sandboxes_and_conversations',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS sandboxes (
        sandbox_id     TEXT        PRIMARY KEY,
        sandbox_name   TEXT        NOT NULL DEFAULT 'openclaw-gateway',
        sandbox_state  TEXT        NOT NULL DEFAULT '',
        dashboard_url  TEXT,
        signed_url     TEXT,
        standard_url   TEXT,
        preview_token  TEXT,
        gateway_token  TEXT,
        gateway_port   INTEGER     NOT NULL DEFAULT 18789,
        ssh_command    TEXT        NOT NULL DEFAULT '',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved       BOOLEAN     NOT NULL DEFAULT FALSE
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS conversations (
        id                   TEXT        PRIMARY KEY,
        sandbox_id           TEXT        NOT NULL,
        name                 TEXT        NOT NULL DEFAULT 'New Conversation',
        model                TEXT        NOT NULL DEFAULT 'openclaw-default',
        openclaw_session_key TEXT        NOT NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_count        INTEGER     NOT NULL DEFAULT 0
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS messages (
        id              SERIAL      PRIMARY KEY,
        conversation_id TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT        NOT NULL,
        content         TEXT        NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_messages_conv_id
      ON messages (conversation_id)
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_conversations_sandbox_id
      ON conversations (sandbox_id)
      `,
    ],
  },
  {
    id: '0002_agents_table',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS agents (
        id              TEXT        PRIMARY KEY,
        name            TEXT        NOT NULL,
        avatar          TEXT        NOT NULL DEFAULT '',
        description     TEXT        NOT NULL DEFAULT '',
        skills          JSONB       NOT NULL DEFAULT '[]',
        trigger_label   TEXT        NOT NULL DEFAULT '',
        status          TEXT        NOT NULL DEFAULT 'draft',
        sandbox_ids     JSONB       NOT NULL DEFAULT '[]',
        skill_graph     JSONB,
        workflow        JSONB,
        agent_rules     JSONB       NOT NULL DEFAULT '[]',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_agents_status
      ON agents (status)
      `,
    ],
  },
  {
    id: '0003_sandbox_runtime_columns',
    statements: [
      `
      ALTER TABLE sandboxes
      ADD COLUMN IF NOT EXISTS vnc_port INTEGER
      `,
      `
      ALTER TABLE sandboxes
      ADD COLUMN IF NOT EXISTS shared_codex_enabled BOOLEAN NOT NULL DEFAULT FALSE
      `,
      `
      ALTER TABLE sandboxes
      ADD COLUMN IF NOT EXISTS shared_codex_model TEXT
      `,
    ],
  },
  {
    id: '0004_control_plane_audit_log',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS control_plane_audit_events (
        event_id     TEXT        PRIMARY KEY,
        occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        request_id   TEXT,
        action_type  TEXT        NOT NULL,
        target_type  TEXT        NOT NULL,
        target_id    TEXT        NOT NULL,
        outcome      TEXT        NOT NULL,
        actor_type   TEXT        NOT NULL,
        actor_id     TEXT        NOT NULL,
        origin       TEXT,
        details      JSONB       NOT NULL DEFAULT '{}'::jsonb
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS control_plane_audit_events_occurred_at_idx
      ON control_plane_audit_events (occurred_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS control_plane_audit_events_action_idx
      ON control_plane_audit_events (action_type, occurred_at DESC)
      `,
    ],
  },
  {
    id: '0005_agents_workspace_memory',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS workspace_memory JSONB NOT NULL DEFAULT '{}'::jsonb
      `,
    ],
  },
  {
    id: '0006_messages_workspace_state',
    statements: [
      `
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS workspace_state JSONB
      `,
    ],
  },
  {
    id: '0007_agents_tool_connections_and_triggers',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS tool_connections JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS triggers JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
    ],
  },
  {
    id: '0008_agent_credentials',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS agent_credentials JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
    ],
  },
  {
    id: '0009_agent_improvements',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS improvements JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
    ],
  },
  {
    id: '0010_agent_forge_sandbox',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS forge_sandbox_id TEXT
      `,
    ],
  },
  {
    id: '0011_agent_runtime_inputs',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS runtime_inputs JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
    ],
  },
  {
    id: '0012_webhook_delivery_dedupes',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS webhook_delivery_dedupes (
        public_id   TEXT        NOT NULL,
        delivery_id TEXT        NOT NULL,
        agent_id    TEXT        NOT NULL,
        trigger_id  TEXT        NOT NULL,
        status      TEXT        NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (public_id, delivery_id)
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS webhook_delivery_dedupes_public_id_updated_idx
      ON webhook_delivery_dedupes (public_id, updated_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS webhook_delivery_dedupes_updated_at_idx
      ON webhook_delivery_dedupes (updated_at DESC)
      `,
    ],
  },
  {
    id: '0013_agent_channels',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS channels JSONB NOT NULL DEFAULT '[]'::jsonb
      `,
    ],
  },
  {
    id: '0014_agent_discovery_documents',
    statements: [
      `
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS discovery_documents JSONB
      `,
    ],
  },
  {
    id: '0015_system_events',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS system_events (
        event_id         TEXT        PRIMARY KEY,
        occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        level            TEXT        NOT NULL,
        category         TEXT        NOT NULL,
        action           TEXT        NOT NULL,
        status           TEXT        NOT NULL,
        message          TEXT        NOT NULL,
        request_id       TEXT,
        trace_id         TEXT,
        span_id          TEXT,
        sandbox_id       TEXT,
        agent_id         TEXT,
        conversation_id  TEXT,
        source           TEXT        NOT NULL,
        details          JSONB       NOT NULL DEFAULT '{}'::jsonb
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS system_events_occurred_at_idx
      ON system_events (occurred_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS system_events_sandbox_idx
      ON system_events (sandbox_id, occurred_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS system_events_agent_idx
      ON system_events (agent_id, occurred_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS system_events_action_idx
      ON system_events (action, occurred_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS system_events_request_idx
      ON system_events (request_id, occurred_at DESC)
      `,
      `
      CREATE INDEX IF NOT EXISTS system_events_trace_idx
      ON system_events (trace_id, occurred_at DESC)
      `,
    ],
  },
  {
    id: '0016_users_and_organizations',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS organizations (
        id          TEXT        PRIMARY KEY,
        name        TEXT        NOT NULL,
        slug        TEXT        NOT NULL UNIQUE,
        plan        TEXT        NOT NULL DEFAULT 'free',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS users (
        id              TEXT        PRIMARY KEY,
        email           TEXT        NOT NULL UNIQUE,
        password_hash   TEXT        NOT NULL,
        display_name    TEXT        NOT NULL DEFAULT '',
        avatar_url      TEXT,
        role            TEXT        NOT NULL DEFAULT 'end_user',
        org_id          TEXT        REFERENCES organizations(id),
        status          TEXT        NOT NULL DEFAULT 'active',
        email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_org_id ON users (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`,
    ],
  },
  {
    id: '0017_sessions',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS sessions (
        id              TEXT        PRIMARY KEY,
        user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token   TEXT        NOT NULL UNIQUE,
        user_agent      TEXT,
        ip_address      TEXT,
        expires_at      TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions (refresh_token)`,
    ],
  },
  {
    id: '0018_api_keys',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS api_keys (
        id              TEXT        PRIMARY KEY,
        user_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name            TEXT        NOT NULL,
        key_hash        TEXT        NOT NULL UNIQUE,
        key_prefix      TEXT        NOT NULL,
        last_used_at    TIMESTAMPTZ,
        expires_at      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash)`,
    ],
  },
  {
    id: '0019_ownership_columns',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by TEXT`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS org_id TEXT`,
      `ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS created_by TEXT`,
      `ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS org_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_agents_created_by ON agents (created_by)`,
      `CREATE INDEX IF NOT EXISTS idx_agents_org_id ON agents (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sandboxes_created_by ON sandboxes (created_by)`,
    ],
  },
  {
    id: '0020_marketplace',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS marketplace_listings (
        id              TEXT        PRIMARY KEY,
        agent_id        TEXT        NOT NULL REFERENCES agents(id),
        publisher_id    TEXT        NOT NULL REFERENCES users(id),
        title           TEXT        NOT NULL,
        slug            TEXT        NOT NULL UNIQUE,
        summary         TEXT        NOT NULL DEFAULT '',
        description     TEXT        NOT NULL DEFAULT '',
        category        TEXT        NOT NULL DEFAULT 'general',
        tags            JSONB       NOT NULL DEFAULT '[]',
        icon_url        TEXT,
        screenshots     JSONB       NOT NULL DEFAULT '[]',
        version         TEXT        NOT NULL DEFAULT '1.0.0',
        status          TEXT        NOT NULL DEFAULT 'draft',
        review_notes    TEXT,
        reviewed_by     TEXT        REFERENCES users(id),
        reviewed_at     TIMESTAMPTZ,
        install_count   INTEGER     NOT NULL DEFAULT 0,
        avg_rating      NUMERIC(3,2) DEFAULT 0,
        published_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_mpl_status ON marketplace_listings (status)`,
      `CREATE INDEX IF NOT EXISTS idx_mpl_category ON marketplace_listings (category)`,
      `CREATE INDEX IF NOT EXISTS idx_mpl_publisher ON marketplace_listings (publisher_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mpl_slug ON marketplace_listings (slug)`,
      `
      CREATE TABLE IF NOT EXISTS marketplace_reviews (
        id              TEXT        PRIMARY KEY,
        listing_id      TEXT        NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
        user_id         TEXT        NOT NULL REFERENCES users(id),
        rating          INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title           TEXT,
        body            TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(listing_id, user_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_mpr_listing ON marketplace_reviews (listing_id)`,
      `
      CREATE TABLE IF NOT EXISTS marketplace_installs (
        id              TEXT        PRIMARY KEY,
        listing_id      TEXT        NOT NULL REFERENCES marketplace_listings(id),
        user_id         TEXT        NOT NULL REFERENCES users(id),
        version         TEXT        NOT NULL,
        installed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(listing_id, user_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_mpi_user ON marketplace_installs (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mpi_listing ON marketplace_installs (listing_id)`,
      `
      CREATE TABLE IF NOT EXISTS agent_versions (
        id              TEXT        PRIMARY KEY,
        agent_id        TEXT        NOT NULL REFERENCES agents(id),
        version         TEXT        NOT NULL,
        changelog       TEXT        NOT NULL DEFAULT '',
        snapshot        JSONB       NOT NULL,
        created_by      TEXT        NOT NULL REFERENCES users(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, version)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_av_agent ON agent_versions (agent_id)`,
    ],
  },
  {
    id: '0021_paperclip_integration',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS paperclip_company_id TEXT`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS paperclip_workers JSONB NOT NULL DEFAULT '[]'::jsonb`,
      `CREATE INDEX IF NOT EXISTS idx_agents_paperclip_company ON agents (paperclip_company_id)`,
    ],
  },
  {
    id: '0022_worker_cost_tracking',
    statements: [
      // Agent-level budget fields
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS worker_composition JSONB DEFAULT NULL`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_budget_monthly_cents INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS total_spent_monthly_cents INTEGER NOT NULL DEFAULT 0`,

      // Cost events — one row per LLM invocation
      `
      CREATE TABLE IF NOT EXISTS cost_events (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        worker_id       UUID        NULL,
        task_id         TEXT        NULL,
        run_id          TEXT        NULL,
        model           TEXT        NOT NULL,
        input_tokens    INTEGER     NOT NULL DEFAULT 0,
        output_tokens   INTEGER     NOT NULL DEFAULT 0,
        cost_cents      NUMERIC(10,4) NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_cost_events_agent ON cost_events (agent_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_cost_events_run ON cost_events (run_id)`,

      // Budget policies — agent-level or worker-level caps
      `
      CREATE TABLE IF NOT EXISTS budget_policies (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id            TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        worker_id           UUID        NULL,
        monthly_cap_cents   INTEGER     NOT NULL,
        soft_warning_pct    INTEGER     NOT NULL DEFAULT 80,
        hard_stop           BOOLEAN     NOT NULL DEFAULT true,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (agent_id, worker_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_budget_policies_agent ON budget_policies (agent_id)`,

      // Execution recordings — full run traces for skill capture
      `
      CREATE TABLE IF NOT EXISTS execution_recordings (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        worker_id       UUID        NULL,
        task_id         TEXT        NULL,
        run_id          TEXT        NOT NULL,
        success         BOOLEAN     NULL,
        tool_calls      JSONB       NOT NULL DEFAULT '[]'::jsonb,
        tokens_used     JSONB       NOT NULL DEFAULT '{}'::jsonb,
        skills_applied  TEXT[]      NOT NULL DEFAULT '{}',
        skills_effective TEXT[]     NOT NULL DEFAULT '{}',
        started_at      TIMESTAMPTZ NULL,
        completed_at    TIMESTAMPTZ NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_exec_recordings_agent ON execution_recordings (agent_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_exec_recordings_run ON execution_recordings (run_id)`,
    ],
  },
  {
    id: '0023_multi_tenant_auth_foundation',
    statements: [
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'customer'`,
      `
      CREATE TABLE IF NOT EXISTS organization_memberships (
        id          TEXT        PRIMARY KEY,
        org_id      TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role        TEXT        NOT NULL,
        status      TEXT        NOT NULL DEFAULT 'active',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (org_id, user_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships (org_id)`,
      `
      CREATE TABLE IF NOT EXISTS auth_identities (
        id          TEXT        PRIMARY KEY,
        user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider    TEXT        NOT NULL,
        subject     TEXT        NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (provider, subject)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id ON auth_identities (user_id)`,
      `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_active_org_id ON sessions (active_org_id)`,
    ],
  },
  {
    id: '0024_marketplace_owner_org',
    statements: [
      `ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS owner_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL`,
      `CREATE INDEX IF NOT EXISTS idx_mpl_owner_org ON marketplace_listings (owner_org_id)`,
      `
      UPDATE marketplace_listings AS mpl
      SET owner_org_id = a.org_id
      FROM agents AS a
      WHERE mpl.agent_id = a.id
        AND mpl.owner_org_id IS NULL
        AND a.org_id IS NOT NULL
      `,
    ],
  },
  {
    id: '0025_creation_session',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS creation_session JSONB DEFAULT NULL`,
    ],
  },
  {
    id: '0026_marketplace_runtime_installs',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS marketplace_runtime_installs (
        id                      TEXT        PRIMARY KEY,
        listing_id              TEXT        NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
        org_id                  TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id                 TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id                TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        source_agent_version_id TEXT        REFERENCES agent_versions(id) ON DELETE SET NULL,
        version                 TEXT        NOT NULL,
        installed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_launched_at        TIMESTAMPTZ NULL,
        UNIQUE (listing_id, org_id, user_id),
        UNIQUE (agent_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_mri_listing ON marketplace_runtime_installs (listing_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mri_org_user ON marketplace_runtime_installs (org_id, user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_mri_user ON marketplace_runtime_installs (user_id)`,
    ],
  },
  {
    id: '0027_eval_results',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS eval_results (
        id              TEXT        PRIMARY KEY,
        agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        sandbox_id      TEXT        NULL,
        mode            TEXT        NOT NULL DEFAULT 'mock',
        tasks           JSONB       NOT NULL DEFAULT '[]',
        loop_state      JSONB       NULL,
        pass_rate       REAL        NOT NULL DEFAULT 0,
        avg_score       REAL        NOT NULL DEFAULT 0,
        total_tasks     INTEGER     NOT NULL DEFAULT 0,
        passed_tasks    INTEGER     NOT NULL DEFAULT 0,
        failed_tasks    INTEGER     NOT NULL DEFAULT 0,
        iterations      INTEGER     NOT NULL DEFAULT 1,
        stop_reason     TEXT        NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_eval_results_agent ON eval_results (agent_id, created_at DESC)`,
    ],
  },
  {
    id: '0028_organization_status',
    statements: [
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
      `CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations (status)`,
    ],
  },
  {
    id: '0029_billing_control_plane',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS billing_customers (
        id                           TEXT        PRIMARY KEY,
        org_id                       TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        stripe_customer_id           TEXT        NOT NULL UNIQUE,
        billing_email                TEXT        NULL,
        company_name                 TEXT        NULL,
        tax_country                  TEXT        NULL,
        tax_id                       TEXT        NULL,
        default_payment_method_brand TEXT        NULL,
        default_payment_method_last4 TEXT        NULL,
        created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (org_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_billing_customers_org ON billing_customers (org_id)`,
      `
      CREATE TABLE IF NOT EXISTS org_entitlements (
        id                   TEXT        PRIMARY KEY,
        org_id               TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        listing_id           TEXT        NULL REFERENCES marketplace_listings(id) ON DELETE SET NULL,
        billing_customer_id  TEXT        NULL REFERENCES billing_customers(id) ON DELETE SET NULL,
        billing_subscription_id TEXT     NULL,
        billing_model        TEXT        NOT NULL,
        billing_status       TEXT        NOT NULL DEFAULT 'active',
        entitlement_status   TEXT        NOT NULL DEFAULT 'active',
        seat_capacity        INTEGER     NOT NULL DEFAULT 1,
        seat_in_use          INTEGER     NOT NULL DEFAULT 0,
        grace_ends_at        TIMESTAMPTZ NULL,
        access_starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        access_ends_at       TIMESTAMPTZ NULL,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (org_id, listing_id, billing_model)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_org_entitlements_org ON org_entitlements (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_org_entitlements_status ON org_entitlements (entitlement_status, billing_status)`,
      `
      CREATE TABLE IF NOT EXISTS billing_subscriptions (
        id                    TEXT        PRIMARY KEY,
        org_id                TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        listing_id            TEXT        NULL REFERENCES marketplace_listings(id) ON DELETE SET NULL,
        entitlement_id        TEXT        NULL REFERENCES org_entitlements(id) ON DELETE SET NULL,
        stripe_subscription_id TEXT       NOT NULL UNIQUE,
        stripe_price_id       TEXT        NULL,
        stripe_product_id     TEXT        NULL,
        status                TEXT        NOT NULL,
        quantity              INTEGER     NOT NULL DEFAULT 1,
        cancel_at_period_end  BOOLEAN     NOT NULL DEFAULT false,
        current_period_start  TIMESTAMPTZ NULL,
        current_period_end    TIMESTAMPTZ NULL,
        trial_ends_at         TIMESTAMPTZ NULL,
        grace_ends_at         TIMESTAMPTZ NULL,
        last_synced_at        TIMESTAMPTZ NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org ON billing_subscriptions (org_id)`,
      `CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON billing_subscriptions (status, current_period_end)`,
      `
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id                     TEXT        PRIMARY KEY,
        org_id                 TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        entitlement_id         TEXT        NULL REFERENCES org_entitlements(id) ON DELETE SET NULL,
        billing_subscription_id TEXT       NULL REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
        stripe_invoice_id      TEXT        NOT NULL UNIQUE,
        stripe_subscription_id TEXT        NULL,
        status                 TEXT        NOT NULL,
        currency               TEXT        NOT NULL DEFAULT 'usd',
        amount_due             BIGINT      NOT NULL DEFAULT 0,
        amount_paid            BIGINT      NOT NULL DEFAULT 0,
        amount_remaining       BIGINT      NOT NULL DEFAULT 0,
        hosted_invoice_url     TEXT        NULL,
        invoice_pdf_url        TEXT        NULL,
        due_at                 TIMESTAMPTZ NULL,
        paid_at                TIMESTAMPTZ NULL,
        last_synced_at         TIMESTAMPTZ NULL,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON billing_invoices (org_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices (status, due_at)`,
      `
      CREATE TABLE IF NOT EXISTS org_entitlement_overrides (
        id                  TEXT        PRIMARY KEY,
        entitlement_id      TEXT        NOT NULL REFERENCES org_entitlements(id) ON DELETE CASCADE,
        kind                TEXT        NOT NULL,
        status              TEXT        NOT NULL DEFAULT 'active',
        reason              TEXT        NOT NULL DEFAULT '',
        effective_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        effective_ends_at   TIMESTAMPTZ NULL,
        created_by          TEXT        NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_org_entitlement_overrides_entitlement ON org_entitlement_overrides (entitlement_id, created_at DESC)`,
      `
      CREATE TABLE IF NOT EXISTS billing_events (
        id              TEXT        PRIMARY KEY,
        org_id          TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        entitlement_id  TEXT        NULL REFERENCES org_entitlements(id) ON DELETE SET NULL,
        source          TEXT        NOT NULL,
        event_type      TEXT        NOT NULL,
        status          TEXT        NOT NULL DEFAULT 'received',
        stripe_event_id TEXT        NULL,
        payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events (org_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_billing_events_entitlement ON billing_events (entitlement_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_billing_events_stripe ON billing_events (stripe_event_id)`,
    ],
  },
  {
    id: '0030_agent_forge_stage',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS forge_stage TEXT DEFAULT NULL`,
    ],
  },
  {
    id: '0031_agent_config_versions',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS agent_config_versions (
        id             TEXT        PRIMARY KEY,
        agent_id       TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        version_number INTEGER     NOT NULL,
        snapshot       JSONB       NOT NULL,
        message        TEXT,
        created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
        created_by     TEXT,
        UNIQUE (agent_id, version_number)
      )
      `,
      `
      CREATE INDEX IF NOT EXISTS idx_agent_config_versions_agent
      ON agent_config_versions (agent_id, version_number DESC)
      `,
    ],
  },
  {
    id: '0032_account_lockouts',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS account_lockouts (
        email           TEXT        PRIMARY KEY,
        attempt_count   INTEGER     NOT NULL DEFAULT 0,
        locked_until    TIMESTAMPTZ NULL,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    ],
  },
  {
    id: '0033_agent_repo_url',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_url TEXT`,
      `ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS repo_url TEXT`,
    ],
  },
  {
    id: '0034_agent_repo_fields',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_owner TEXT`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_name TEXT`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_default_branch TEXT DEFAULT 'main'`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_last_pushed_at TIMESTAMPTZ`,
    ],
  },
  {
    id: '0035_github_connections',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS github_connections (
        id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id           TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        github_user_id    TEXT        NOT NULL,
        github_username   TEXT        NOT NULL,
        access_token      TEXT        NOT NULL,
        token_scope       TEXT        NOT NULL DEFAULT 'repo',
        connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_github_connections_user_id ON github_connections(user_id)`,
    ],
  },
  {
    id: '0036_agent_git_workflow',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS active_branch TEXT DEFAULT 'main'`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS repo_initialized_at TIMESTAMPTZ`,
    ],
  },
  {
    id: '0036_agent_branches',
    statements: [
      `
      CREATE TABLE IF NOT EXISTS agent_branches (
        id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
        agent_id        TEXT        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        branch_name     TEXT        NOT NULL,
        base_branch     TEXT        NOT NULL DEFAULT 'main',
        title           TEXT        NOT NULL,
        description     TEXT        NOT NULL DEFAULT '',
        status          TEXT        NOT NULL DEFAULT 'open',
        pr_number       INTEGER,
        pr_url          TEXT,
        created_by      TEXT        REFERENCES users(id),
        merged_at       TIMESTAMPTZ,
        feature_stage   TEXT        DEFAULT 'think',
        feature_context JSONB       DEFAULT NULL,
        feature_prd     TEXT        DEFAULT NULL,
        feature_plan    JSONB       DEFAULT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, branch_name)
      )
      `,
      `CREATE INDEX IF NOT EXISTS idx_agent_branches_agent ON agent_branches (agent_id, status)`,
    ],
  },
  {
    id: '0038_agent_service_ports',
    statements: [
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS service_ports JSONB DEFAULT NULL`,
    ],
  },
];

export async function runSchemaMigrations(): Promise<void> {
  await ensureSchemaMigrationsLedger();

  const appliedMigrations = await withConn(async (client) => {
    const result = await client.query(
      'SELECT id FROM schema_migrations ORDER BY id ASC',
    );
    return new Set(result.rows.map((row) => String(row.id)));
  });

  for (const migration of MIGRATIONS) {
    if (appliedMigrations.has(migration.id)) {
      continue;
    }

    await withConn(async (client) => {
      for (const statement of migration.statements) {
        await client.query(statement);
      }

      await client.query(
        'INSERT INTO schema_migrations (id) VALUES ($1)',
        [migration.id],
      );
    });
  }
}

async function ensureSchemaMigrationsLedger(): Promise<void> {
  await withConn(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  });
}
