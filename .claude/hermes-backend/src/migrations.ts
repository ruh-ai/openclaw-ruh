import { query } from './db';

const MIGRATIONS = [
  {
    id: '0001_initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        version INTEGER DEFAULT 1,
        model TEXT DEFAULT 'sonnet',
        status TEXT DEFAULT 'active',
        file_path TEXT,
        prompt_hash TEXT,
        tasks_total INTEGER DEFAULT 0,
        tasks_passed INTEGER DEFAULT 0,
        tasks_failed INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        agent TEXT DEFAULT 'hermes',
        tags TEXT DEFAULT '',
        task_context TEXT DEFAULT '',
        vector_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent)`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        tasks_count INTEGER DEFAULT 0,
        learnings_count INTEGER DEFAULT 0,
        summary TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS task_logs (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        delegated_to TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        result_summary TEXT,
        error TEXT,
        session_id TEXT REFERENCES sessions(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_status ON task_logs(status)`,
      `CREATE TABLE IF NOT EXISTS agent_scores (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        task_id TEXT REFERENCES task_logs(id),
        passed BOOLEAN NOT NULL,
        score INTEGER CHECK (score >= 0 AND score <= 10),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_agent_scores_agent ON agent_scores(agent_name)`,
      `CREATE TABLE IF NOT EXISTS refinements (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        change_description TEXT NOT NULL,
        reason TEXT,
        diff_summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    ],
  },
  {
    id: '0002_task_enhancements',
    statements: [
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS parent_task_id TEXT REFERENCES task_logs(id)`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low'))`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_parent ON task_logs(parent_task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_session ON task_logs(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_delegated ON task_logs(delegated_to)`,
    ],
  },
  {
    id: '0003_memory_fts',
    statements: [],  // FTS index applied with try-catch at runtime; see runMigrations below
  },
  {
    id: '0004_queue_schema',
    statements: [
      // Queue jobs — mirrors BullMQ state into PostgreSQL for dashboard + history
      `CREATE TABLE IF NOT EXISTS queue_jobs (
        id TEXT PRIMARY KEY,
        queue_name TEXT NOT NULL,
        job_id TEXT NOT NULL,
        task_log_id TEXT REFERENCES task_logs(id),
        agent_name TEXT,
        priority INTEGER DEFAULT 5,
        status TEXT DEFAULT 'waiting',
        source TEXT DEFAULT 'api',
        prompt TEXT,
        result_json JSONB,
        error_message TEXT,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT 600000,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_queue_jobs_queue ON queue_jobs(queue_name)`,
      `CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_queue_jobs_created ON queue_jobs(created_at DESC)`,

      // Scheduled tasks — cron definitions for repeatable work
      `CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        agent_name TEXT DEFAULT 'auto',
        priority INTEGER DEFAULT 5,
        timeout_ms INTEGER DEFAULT 600000,
        enabled BOOLEAN DEFAULT true,
        last_run_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ,
        run_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Evolution reports — structured analysis output
      `CREATE TABLE IF NOT EXISTS evolution_reports (
        id TEXT PRIMARY KEY,
        report_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        details JSONB,
        actions_taken JSONB,
        trigger TEXT DEFAULT 'scheduled',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_evolution_reports_type ON evolution_reports(report_type)`,

      // Worker heartbeats — track worker health
      `CREATE TABLE IF NOT EXISTS worker_status (
        id TEXT PRIMARY KEY,
        worker_name TEXT UNIQUE NOT NULL,
        queue_name TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        current_job_id TEXT,
        pid INTEGER,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        last_heartbeat TIMESTAMPTZ DEFAULT NOW()
      )`,

      // Extend task_logs with queue-related columns
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS queue_job_id TEXT`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS output_json JSONB`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS tokens_used INTEGER`,
    ],
  },
  {
    id: '0005_goals_analyst_pool',
    statements: [
      // Goals — high-level objectives that tasks roll up to
      `CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical','high','normal','low')),
        status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
        deadline TIMESTAMPTZ,
        acceptance_criteria JSONB DEFAULT '[]',
        progress_pct INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)`,

      // Link tasks to goals
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS goal_id TEXT REFERENCES goals(id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_goal ON task_logs(goal_id)`,

      // Worker pool configuration — dynamic concurrency per queue
      `CREATE TABLE IF NOT EXISTS worker_pool_config (
        id TEXT PRIMARY KEY,
        queue_name TEXT NOT NULL,
        agent_name TEXT,
        concurrency INTEGER NOT NULL DEFAULT 1,
        max_concurrency INTEGER NOT NULL DEFAULT 5,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(queue_name, agent_name)
      )`,

      // Seed default pool configs
      `INSERT INTO worker_pool_config (id, queue_name, agent_name, concurrency, max_concurrency)
       VALUES
         ('pool-ingestion', 'hermes-ingestion', NULL, 5, 10),
         ('pool-execution', 'hermes-execution', NULL, 2, 5),
         ('pool-learning', 'hermes-learning', NULL, 3, 5),
         ('pool-evolution', 'hermes-evolution', NULL, 1, 3),
         ('pool-factory', 'hermes-factory', NULL, 1, 3),
         ('pool-analyst', 'hermes-analyst', NULL, 1, 2)
       ON CONFLICT DO NOTHING`,
    ],
  },
  {
    id: '0006_agent_skills',
    statements: [
      // Agent skills — structured capabilities extracted from .md files
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS tools TEXT DEFAULT ''`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS stack TEXT DEFAULT ''`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS prompt_size INTEGER DEFAULT 0`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ`,

      // Deduplication hash for tasks
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS dedup_hash TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_dedup ON task_logs(dedup_hash) WHERE dedup_hash IS NOT NULL`,

      // Circuit breaker state on agents
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS circuit_state TEXT DEFAULT 'closed' CHECK (circuit_state IN ('closed','open','half-open'))`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS circuit_opened_at TIMESTAMPTZ`,
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0`,
    ],
  },
  {
    id: '0007_cost_tracking',
    statements: [
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,6) DEFAULT 0`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0`,
      `ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS idx_task_logs_cost ON task_logs(cost_usd) WHERE cost_usd > 0`,
    ],
  },
];

async function applyMemoryFtsIndex(): Promise<void> {
  const { query } = await import('./db');
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories USING gin(to_tsvector('english', coalesce(text,'') || ' ' || coalesce(tags,'')))`);
  } catch {
    // pg_trgm or null values may prevent this — ILIKE fallback in searchMemories handles it
  }
}

export async function runMigrations(): Promise<void> {
  for (const migration of MIGRATIONS) {
    for (const sql of migration.statements) {
      await query(sql);
    }
  }
  await applyMemoryFtsIndex();
  console.log(`[hermes] Migrations complete (${MIGRATIONS.length} applied)`);
}
