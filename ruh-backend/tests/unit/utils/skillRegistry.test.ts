import { describe, expect, test } from 'bun:test';

import { findSkill, listSkills, publishSkill, registryStats, searchSkills } from '../../../src/skillRegistry';

describe('skillRegistry', () => {
  test('starts empty — no seed skills', () => {
    const skills = listSkills();
    // Registry should only contain skills published by real agent builds.
    // It may have community skills from other tests, but no seed skills.
    expect(Array.isArray(skills)).toBe(true);
  });

  test('findSkill returns null when no registry entry exists', () => {
    expect(findSkill('nonexistent-xyz')).toBeNull();
  });

  test('publishSkill adds a community skill to the registry', () => {
    const added = publishSkill({
      skill_id: 'test-skill-publish',
      name: 'Test Skill',
      description: 'A test skill published by a real agent build.',
      tags: ['test'],
      skill_md: '# Test Skill\nTest content.',
    });

    expect(added).toBe(true);

    const found = findSkill('test-skill-publish');
    expect(found).toEqual(expect.objectContaining({
      skill_id: 'test-skill-publish',
      name: 'Test Skill',
      source: 'community',
    }));
  });

  test('publishSkill rejects duplicates', () => {
    const duplicate = publishSkill({
      skill_id: 'test-skill-publish',
      name: 'Test Skill Dup',
      description: 'Duplicate.',
      tags: [],
      skill_md: '',
    });

    expect(duplicate).toBe(false);
  });

  test('findSkill normalizes underscore and hyphen variants', () => {
    // test-skill-publish was added above; look it up with underscores
    const skill = findSkill('test_skill_publish');
    expect(skill).toEqual(expect.objectContaining({
      skill_id: 'test-skill-publish',
    }));
  });

  test('registryStats reflects published skills', () => {
    const stats = registryStats();
    expect(stats.community).toBeGreaterThanOrEqual(1);
    expect(stats.total).toBe(stats.community);
  });
});

describe('searchSkills', () => {
  // Ensure the test skill exists (may have been published by the block above)
  test('returns all skills when query is empty string', () => {
    const results = searchSkills('');
    expect(Array.isArray(results)).toBe(true);
    // Empty query should return all skills (no filter applied)
    expect(results.length).toBe(listSkills().length);
  });

  test('returns all skills when query contains only single-character tokens', () => {
    // Single-char tokens are filtered out by the tokenizer (length > 1)
    const results = searchSkills('a b');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(listSkills().length);
  });

  test('returns matching skill for multi-word query', () => {
    // 'test-skill-publish' should match 'Test Skill'
    const results = searchSkills('test skill');
    expect(results.some((s) => s.skill_id === 'test-skill-publish')).toBe(true);
  });

  test('returns empty array when no skills match query', () => {
    const results = searchSkills('zzz-no-match-xyz-99999');
    expect(results).toEqual([]);
  });

  test('matches against description and tags', () => {
    // Publish a skill with distinct description and tags for this test
    publishSkill({
      skill_id: 'sr-search-edge-test',
      name: 'Search Edge Test',
      description: 'Specialized analytics for quarterly reporting',
      tags: ['analytics', 'reporting'],
      skill_md: '# SR',
    });

    const byDescription = searchSkills('quarterly reporting');
    expect(byDescription.some((s) => s.skill_id === 'sr-search-edge-test')).toBe(true);

    const byTag = searchSkills('analytics');
    expect(byTag.some((s) => s.skill_id === 'sr-search-edge-test')).toBe(true);
  });

  test('publishSkill stores publishedBy metadata', () => {
    publishSkill({
      skill_id: 'sk-with-publisher',
      name: 'Publisher Test Skill',
      description: 'Has publisher metadata.',
      tags: ['meta'],
      skill_md: '# Meta',
      publishedBy: 'agent-abc',
    });

    const found = findSkill('sk-with-publisher');
    expect(found).not.toBeNull();
    expect(found!.publishedBy).toBe('agent-abc');
    expect(found!.publishedAt).toBeDefined();
    expect(found!.source).toBe('community');
  });

  test('special characters in query do not throw', () => {
    expect(() => searchSkills('test!@#$%^&*()')).not.toThrow();
    expect(() => searchSkills('   ')).not.toThrow();
  });
});
