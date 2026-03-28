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
