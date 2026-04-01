import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './config';
import { query } from './db';

export interface ParsedAgent {
  name: string;
  description: string;
  model: string;
  tools: string;
  skills: string[];
  stack: string;
  promptHash: string;
  promptSize: number;
  filePath: string;
}

/**
 * Parse an agent .md file and extract structured metadata.
 */
export function parseAgentFile(filePath: string): ParsedAgent | null {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const promptHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Parse frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = fmMatch ? fmMatch[1] : '';

  const getName = (fm: string) => fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() || path.basename(filePath, '.md');
  const getDesc = (fm: string) => fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';
  const getModel = (fm: string) => fm.match(/^model:\s*(.+)$/m)?.[1]?.trim() || 'sonnet';
  const getTools = (fm: string) => fm.match(/^tools:\s*(.+)$/m)?.[1]?.trim() || '';

  // Extract skills from ## sections in the body
  const body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
  const skills: string[] = [];

  // Extract from ## Stack section
  const stackMatch = body.match(/##\s*Stack\s*\n([\s\S]*?)(?=\n##|\n---|\z)/i);
  const stack = stackMatch ? stackMatch[1].trim().split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean).join(', ') : '';

  // Extract skills from ## Key Patterns, ## Process, specific named sections
  const skillSections = [
    /##\s*(?:Key Patterns|Key Files|Your Process|Process|Quick Commands|Rules)\s*\n([\s\S]*?)(?=\n##|\n---|\z)/gi,
  ];

  for (const pattern of skillSections) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      const sectionTitle = match[0].match(/##\s*([^\n]+)/)?.[1]?.trim() || '';
      const lines = match[1].trim().split('\n')
        .map(l => l.replace(/^[-*\d.]\s*/, '').replace(/\*\*/g, '').trim())
        .filter(l => l.length > 3 && l.length < 120);

      // Take first 5 meaningful lines as skills
      for (const line of lines.slice(0, 5)) {
        skills.push(line);
      }
    }
  }

  // Also extract capabilities from bullet points under headings
  const bulletSkills = body.match(/^[-*]\s+\*\*([^*]+)\*\*/gm);
  if (bulletSkills) {
    for (const b of bulletSkills.slice(0, 10)) {
      const skill = b.replace(/^[-*]\s+\*\*/, '').replace(/\*\*.*/, '').trim();
      if (skill.length > 3 && skill.length < 80 && !skills.includes(skill)) {
        skills.push(skill);
      }
    }
  }

  return {
    name: getName(frontmatter),
    description: getDesc(frontmatter),
    model: getModel(frontmatter),
    tools: getTools(frontmatter),
    skills: skills.slice(0, 15), // cap at 15 skills
    stack,
    promptHash,
    promptSize: content.length,
    filePath,
  };
}

/**
 * Sync all agent .md files to the database.
 * Creates missing agents, updates changed ones, tracks prompt hash for evolution detection.
 */
export async function syncAgentsFromDisk(): Promise<{
  synced: number;
  created: number;
  updated: number;
  unchanged: number;
}> {
  const config = getConfig();
  const agentsDir = config.agentsDir;

  if (!fs.existsSync(agentsDir)) {
    console.warn(`[hermes:sync] Agents directory not found: ${agentsDir}`);
    return { synced: 0, created: 0, updated: 0, unchanged: 0 };
  }

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    const parsed = parseAgentFile(filePath);
    if (!parsed) continue;

    // Check if agent exists in DB
    const existing = await query('SELECT * FROM agents WHERE name = $1', [parsed.name]);

    if (existing.rows.length === 0) {
      // Create new agent
      await query(
        `INSERT INTO agents (id, name, description, model, file_path, prompt_hash, tools, stack, skills, prompt_size, last_synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [uuidv4(), parsed.name, parsed.description, parsed.model, parsed.filePath,
         parsed.promptHash, parsed.tools, parsed.stack, JSON.stringify(parsed.skills), parsed.promptSize],
      );
      created++;
      console.log(`[hermes:sync] Created agent: ${parsed.name}`);
    } else {
      const row = existing.rows[0];
      const currentHash = row.prompt_hash;

      if (currentHash !== parsed.promptHash) {
        // Agent file changed — update
        await query(
          `UPDATE agents SET
            description = $1, model = $2, file_path = $3, prompt_hash = $4,
            tools = $5, stack = $6, skills = $7, prompt_size = $8,
            last_synced_at = NOW(), updated_at = NOW()
           WHERE name = $9`,
          [parsed.description, parsed.model, parsed.filePath, parsed.promptHash,
           parsed.tools, parsed.stack, JSON.stringify(parsed.skills), parsed.promptSize, parsed.name],
        );
        updated++;
        console.log(`[hermes:sync] Updated agent: ${parsed.name} (prompt changed)`);
      } else {
        // Just update sync timestamp and fill missing fields
        await query(
          `UPDATE agents SET
            file_path = COALESCE(NULLIF($1, ''), file_path),
            tools = COALESCE(NULLIF($2, ''), tools),
            stack = COALESCE(NULLIF($3, ''), stack),
            skills = CASE WHEN skills IS NULL OR skills = '[]'::jsonb THEN $4::jsonb ELSE skills END,
            prompt_size = COALESCE(NULLIF($5, 0), prompt_size),
            last_synced_at = NOW()
           WHERE name = $6`,
          [parsed.filePath, parsed.tools, parsed.stack, JSON.stringify(parsed.skills), parsed.promptSize, parsed.name],
        );
        unchanged++;
      }
    }
  }

  const total = created + updated + unchanged;
  console.log(`[hermes:sync] Synced ${total} agents (${created} created, ${updated} updated, ${unchanged} unchanged)`);
  return { synced: total, created, updated, unchanged };
}
