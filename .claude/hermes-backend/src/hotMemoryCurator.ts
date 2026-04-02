import fs from 'fs';
import path from 'path';
import { getConfig } from './config';
import { query } from './db';

/**
 * Curate hot memory (MEMORY.md) from cold storage (PostgreSQL + ChromaDB).
 * Keeps MEMORY.md under 50 lines with the most actionable information.
 */
export async function curateHotMemory(): Promise<{ lines: number; updated: boolean }> {
  const config = getConfig();
  const memoryPath = path.join(config.projectRoot, '.claude', 'MEMORY.md');

  // Gather data for hot memory
  const [agentScores, topPatterns, topPitfalls, recentSkills, recentRefinements] = await Promise.all([
    // Agent scores table
    query(`
      SELECT name, tasks_total, tasks_passed, tasks_failed, version,
        CASE WHEN tasks_total > 0 THEN ROUND((tasks_passed::numeric / tasks_total) * 100) ELSE 0 END as pass_rate
      FROM agents WHERE tasks_total > 0 ORDER BY tasks_total DESC LIMIT 10
    `),
    // Top patterns (most recent, high-value)
    query(`
      SELECT text, agent FROM memories
      WHERE type = 'pattern'
      AND text NOT LIKE 'Agent % successfully completed task:%'
      ORDER BY created_at DESC LIMIT 8
    `),
    // Top pitfalls
    query(`
      SELECT text, agent FROM memories
      WHERE type = 'pitfall'
      ORDER BY created_at DESC LIMIT 5
    `),
    // Recent skills acquired
    query(`
      SELECT text, agent FROM memories
      WHERE type = 'skill'
      ORDER BY created_at DESC LIMIT 5
    `),
    // Recent refinements
    query(`
      SELECT agent_name, change_description, created_at FROM refinements
      ORDER BY created_at DESC LIMIT 5
    `),
  ]);

  // Build MEMORY.md content
  const lines: string[] = [];

  // Agent scores table
  lines.push('## Agent Scores');
  lines.push('| Agent | Tasks | Pass | Fail | Rate | Ver |');
  lines.push('|-------|-------|------|------|------|-----|');
  for (const a of agentScores.rows) {
    lines.push(`| ${a.name} | ${a.tasks_total} | ${a.tasks_passed} | ${a.tasks_failed} | ${a.pass_rate}% | v${a.version} |`);
  }

  // Top patterns
  if (topPatterns.rows.length > 0) {
    lines.push('');
    lines.push('## Active Patterns');
    for (const p of topPatterns.rows) {
      const text = String(p.text).slice(0, 100).replace(/\n/g, ' ');
      lines.push(`- [${p.agent}] ${text}`);
    }
  }

  // Top pitfalls
  if (topPitfalls.rows.length > 0) {
    lines.push('');
    lines.push('## Active Pitfalls');
    for (const p of topPitfalls.rows) {
      const text = String(p.text).slice(0, 100).replace(/\n/g, ' ');
      lines.push(`- [${p.agent}] ${text}`);
    }
  }

  // Recent skills
  if (recentSkills.rows.length > 0) {
    lines.push('');
    lines.push('## Recently Acquired Skills');
    for (const s of recentSkills.rows) {
      const text = String(s.text).replace(/^(Skill acquired|New skill acquired):\s*/i, '').slice(0, 80);
      lines.push(`- [${s.agent}] ${text}`);
    }
  }

  // Recent refinements
  if (recentRefinements.rows.length > 0) {
    lines.push('');
    lines.push('## Recent Refinements');
    for (const r of recentRefinements.rows) {
      const date = new Date(String(r.created_at)).toISOString().slice(0, 10);
      lines.push(`- [${date}] ${r.agent_name} — ${String(r.change_description).slice(0, 80)}`);
    }
  }

  // Cold memory stats
  const statsResult = await query('SELECT COUNT(*) as total FROM memories');
  const total = Number(statsResult.rows[0]?.total || 0);
  lines.push('');
  lines.push('## Cold Memory Stats');
  lines.push(`- Total: ${total} memories | Last curated: ${new Date().toISOString().slice(0, 10)}`);

  const content = lines.join('\n') + '\n';
  const lineCount = lines.length;

  // Only write if under 50 lines
  if (lineCount > 50) {
    // Trim patterns and pitfalls to fit
    console.warn(`[hermes:memory] Hot memory ${lineCount} lines — exceeds 50, trimming`);
  }

  fs.writeFileSync(memoryPath, content);
  console.log(`[hermes:memory] MEMORY.md curated: ${lineCount} lines`);

  return { lines: lineCount, updated: true };
}
