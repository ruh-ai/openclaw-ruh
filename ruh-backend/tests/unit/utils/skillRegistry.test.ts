import { describe, expect, test } from 'bun:test';

import { findSkill, listSkills } from '../../../src/skillRegistry';

describe('skillRegistry', () => {
  test('lists seeded skills with non-empty metadata', () => {
    const skills = listSkills();

    expect(skills.length).toBeGreaterThanOrEqual(5);
    expect(skills[0]).toEqual(expect.objectContaining({
      skill_id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      tags: expect.any(Array),
      skill_md: expect.any(String),
    }));
  });

  test('findSkill returns the seeded entry for an exact skill id', () => {
    const skill = findSkill('slack-reader');

    expect(skill).toEqual(expect.objectContaining({
      skill_id: 'slack-reader',
      name: 'Slack Reader',
    }));
    expect(skill?.skill_md.trim().length).toBeGreaterThan(0);
  });

  test('findSkill normalizes underscore and hyphen variants', () => {
    const skill = findSkill('slack_reader');

    expect(skill).toEqual(expect.objectContaining({
      skill_id: 'slack-reader',
    }));
  });

  test('findSkill returns null when no registry entry exists', () => {
    expect(findSkill('nonexistent-xyz')).toBeNull();
  });
});
