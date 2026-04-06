import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './config';
import { query } from './db';
import { syncAgentsFromDisk } from './agentSync';

/**
 * Get skills an agent has acquired from task execution (stored as type='skill' memories).
 */
export async function getAcquiredSkills(agentName: string): Promise<string[]> {
  const result = await query(
    `SELECT text, MAX(created_at) as latest FROM memories
     WHERE agent = $1 AND type = 'skill'
     GROUP BY text
     ORDER BY latest DESC
     LIMIT 20`,
    [agentName],
  );
  return result.rows.map(r => String(r.text));
}

/**
 * Write acquired skills back to the agent's .md file under a "## Learned Skills" section.
 * Only adds skills not already present in the file.
 */
export async function writeSkillsToAgent(agentName: string): Promise<{ added: number; total: number }> {
  const config = getConfig();
  const agentPath = path.join(config.agentsDir, `${agentName}.md`);

  if (!fs.existsSync(agentPath)) {
    return { added: 0, total: 0 };
  }

  const acquiredSkills = await getAcquiredSkills(agentName);
  if (acquiredSkills.length === 0) return { added: 0, total: 0 };

  let content = fs.readFileSync(agentPath, 'utf-8');

  // Check which skills are already in the file
  const existingContent = content.toLowerCase();
  const newSkills = acquiredSkills.filter(skill => {
    const key = skill.replace(/^(Skill acquired|New skill acquired):\s*/i, '').toLowerCase().slice(0, 40);
    return !existingContent.includes(key);
  });

  if (newSkills.length === 0) return { added: 0, total: acquiredSkills.length };

  // Find or create the "## Learned Skills" section
  const learnedSection = content.match(/## Learned Skills\s*\n([\s\S]*?)(?=\n##|\z)/i);

  const skillLines = newSkills.map(s => {
    const clean = s.replace(/^(Skill acquired|New skill acquired):\s*/i, '');
    return `- ${clean}`;
  }).join('\n');

  if (learnedSection) {
    // Append to existing section
    const insertPoint = learnedSection.index! + learnedSection[0].length;
    content = content.slice(0, insertPoint) + '\n' + skillLines + content.slice(insertPoint);
  } else {
    // Add new section before the last ---  or at end
    content = content.trimEnd() + '\n\n## Learned Skills\n' + skillLines + '\n';
  }

  fs.writeFileSync(agentPath, content);

  // Log refinement
  await query(
    `INSERT INTO refinements (id, agent_name, change_description, reason)
     VALUES ($1, $2, $3, $4)`,
    [uuidv4(), agentName, `Added ${newSkills.length} learned skills from task execution`, 'Skill acquisition loop'],
  );

  // Bump version
  await query('UPDATE agents SET version = version + 1, updated_at = NOW() WHERE name = $1', [agentName]);

  // Re-sync to update prompt hash and skills list
  await syncAgentsFromDisk();

  console.log(`[hermes:skills] ${agentName}: added ${newSkills.length} learned skills`);
  return { added: newSkills.length, total: acquiredSkills.length };
}

/**
 * Run skill acquisition for all agents that have acquired new skills.
 * Called by the evolution worker during maintenance cycles.
 */
export async function runSkillAcquisitionSweep(): Promise<{ agentsUpdated: number; totalSkillsAdded: number }> {
  // Find agents with unwritten skills
  const result = await query(`
    SELECT DISTINCT agent FROM memories
    WHERE type = 'skill'
    AND created_at > NOW() - INTERVAL '24 hours'
  `);

  let agentsUpdated = 0;
  let totalSkillsAdded = 0;

  for (const row of result.rows) {
    const agentName = String(row.agent);
    const { added } = await writeSkillsToAgent(agentName);
    if (added > 0) {
      agentsUpdated++;
      totalSkillsAdded += added;
    }
  }

  if (totalSkillsAdded > 0) {
    console.log(`[hermes:skills] Sweep: ${agentsUpdated} agents updated, ${totalSkillsAdded} skills added`);
  }

  return { agentsUpdated, totalSkillsAdded };
}
