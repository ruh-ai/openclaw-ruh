import { describe, expect, test } from 'bun:test';

import {
  listTemplates,
  getTemplate,
  searchTemplates,
  listCategories,
  type AgentTemplate,
} from '../../src/templateRegistry';

// ─── listTemplates ────────────────────────────────────────────────────────────

describe('listTemplates', () => {
  test('returns all 8 seeded templates when no category is provided', () => {
    const templates = listTemplates();
    expect(templates.length).toBe(8);
  });

  test('each template has required metadata fields', () => {
    for (const t of listTemplates()) {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(typeof t.category).toBe('string');
      expect(typeof t.icon).toBe('string');
      expect(Array.isArray(t.tags)).toBe(true);
      expect(['beginner', 'intermediate', 'advanced']).toContain(t.difficulty);
      expect(typeof t.estimatedSetupTime).toBe('string');
      expect(typeof t.skillCount).toBe('number');
    }
  });

  test('each template architecturePlan has non-empty soulContent', () => {
    for (const t of listTemplates()) {
      expect(t.architecturePlan.soulContent.trim().length).toBeGreaterThan(50);
    }
  });

  test('each template skill has a non-empty skill_md', () => {
    for (const t of listTemplates()) {
      for (const skill of t.architecturePlan.skills) {
        expect(typeof skill.skill_id).toBe('string');
        expect(skill.skill_id.length).toBeGreaterThan(0);
        expect(typeof skill.skill_md).toBe('string');
        expect(skill.skill_md.trim().length).toBeGreaterThan(50);
      }
    }
  });

  test('skillCount matches the number of skills in architecturePlan', () => {
    for (const t of listTemplates()) {
      expect(t.skillCount).toBe(t.architecturePlan.skills.length);
    }
  });

  test('filters by category (case-insensitive)', () => {
    const productivity = listTemplates('Productivity');
    expect(productivity.length).toBeGreaterThanOrEqual(1);
    for (const t of productivity) {
      expect(t.category.toLowerCase()).toBe('productivity');
    }
  });

  test('returns empty array for an unknown category', () => {
    expect(listTemplates('UnknownCategory99')).toEqual([]);
  });

  test('category filter is case-insensitive', () => {
    const upper = listTemplates('PRODUCTIVITY');
    const lower = listTemplates('productivity');
    expect(upper.map((t) => t.id)).toEqual(lower.map((t) => t.id));
  });
});

// ─── getTemplate ─────────────────────────────────────────────────────────────

describe('getTemplate', () => {
  test('returns the full template for a known id', () => {
    const t = getTemplate('customer-support-bot');
    expect(t).not.toBeNull();
    expect(t!.id).toBe('customer-support-bot');
    expect(t!.name).toBe('Customer Support Bot');
    expect(t!.architecturePlan.skills.length).toBe(3);
  });

  test('returns full architecturePlan including skill_md content', () => {
    const t = getTemplate('github-pr-reviewer');
    expect(t).not.toBeNull();
    expect(t!.architecturePlan.soulContent).toContain('SOUL.md');
    const prFetcher = t!.architecturePlan.skills.find((s) => s.skill_id === 'github-pr-fetcher');
    expect(prFetcher).toBeDefined();
    expect(prFetcher!.skill_md).toContain('GITHUB_TOKEN');
  });

  test('returns null for an unknown id', () => {
    expect(getTemplate('nonexistent-template-xyz')).toBeNull();
  });

  test('every seeded template id can be fetched individually', () => {
    const ids = listTemplates().map((t) => t.id);
    for (const id of ids) {
      expect(getTemplate(id)).not.toBeNull();
    }
  });
});

// ─── searchTemplates ──────────────────────────────────────────────────────────

describe('searchTemplates', () => {
  test('returns all templates for empty query', () => {
    expect(searchTemplates('').length).toBe(listTemplates().length);
  });

  test('returns all templates for whitespace-only query', () => {
    expect(searchTemplates('   ').length).toBe(listTemplates().length);
  });

  test('finds templates by keyword in name', () => {
    const results = searchTemplates('github');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const ids = results.map((t) => t.id);
    expect(ids).toContain('github-pr-reviewer');
  });

  test('finds templates by tag', () => {
    const results = searchTemplates('shopify');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('shopify-inventory-tracker');
  });

  test('finds templates by category', () => {
    const results = searchTemplates('engineering');
    expect(results.map((t) => t.category)).toContain('Engineering');
  });

  test('returns empty array when no match', () => {
    expect(searchTemplates('zzznomatchzzz')).toEqual([]);
  });

  test('results are sorted by relevance (higher score first)', () => {
    // "slack" appears in multiple templates — the one most focused on Slack should rank higher
    const results = searchTemplates('slack support');
    expect(results.length).toBeGreaterThan(0);
    // customer-support-bot has both "slack" in tags and "support" in name/category
    const first = results[0];
    expect(['customer-support-bot', 'meeting-notes-agent']).toContain(first.id);
  });
});

// ─── listCategories ───────────────────────────────────────────────────────────

describe('listCategories', () => {
  test('returns all distinct categories', () => {
    const categories = listCategories();
    expect(categories.length).toBeGreaterThanOrEqual(4);
  });

  test('each category entry has a category string and a positive count', () => {
    for (const entry of listCategories()) {
      expect(typeof entry.category).toBe('string');
      expect(entry.count).toBeGreaterThan(0);
    }
  });

  test('counts sum to total template count', () => {
    const total = listCategories().reduce((acc, e) => acc + e.count, 0);
    expect(total).toBe(listTemplates().length);
  });

  test('categories are sorted alphabetically', () => {
    const categories = listCategories().map((e) => e.category);
    const sorted = [...categories].sort((a, b) => a.localeCompare(b));
    expect(categories).toEqual(sorted);
  });
});
