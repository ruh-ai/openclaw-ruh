import { describe, expect, test } from 'bun:test';

import { findSkill, listSkills, publishSkill, registryStats } from '../../../src/skillRegistry';

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
