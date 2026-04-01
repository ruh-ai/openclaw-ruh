import { describe, expect, test } from 'bun:test';

import {
  buildConfigureAgentCronAddCommand,
  buildHomeFileWriteCommand,
  buildCronDeleteCommand,
  buildCronRunCommand,
  normalizePathSegment,
} from '../../src/docker';

describe('shell-safe route command builders', () => {
  test('configure-agent writes use normalized skill paths and quote content literally', () => {
    const skillId = normalizePathSegment('../evil skill');
    const command = buildHomeFileWriteCommand(
      `.openclaw/workspace/skills/${skillId}/SKILL.md`,
      "line one\n$(touch /tmp/pwned) && echo 'owned'",
    );

    expect(skillId).toBe('evil-skill');
    expect(command).toContain('$HOME/.openclaw/workspace/skills/evil-skill/SKILL.md');
    expect(command).not.toContain('../evil skill');
    expect(command).toContain(`'line one\n$(touch /tmp/pwned) && echo '"'"'owned'"'"''`);
  });

  test('configure-agent writes reject traversal and unexpected path characters', () => {
    expect(() => buildHomeFileWriteCommand('../escape/SKILL.md', 'noop')).toThrow(
      'Relative path must contain only safe characters',
    );
    expect(() => buildHomeFileWriteCommand('.openclaw/workspace/skills/evil skill/SKILL.md', 'noop')).toThrow(
      'Relative path must contain only safe characters',
    );
  });

  test('configure-agent cron registration quotes literal payloads', () => {
    const command = buildConfigureAgentCronAddCommand({
      name: 'nightly; echo owned',
      schedule: '0 9 * * *',
      message: '$(curl attacker)',
    });

    expect(command).toBe(
      `openclaw cron add --name 'nightly; echo owned' --cron '0 9 * * *' --message '$(curl attacker)' 2>&1`,
    );
  });

  test('cron mutation commands quote malicious job ids literally', () => {
    expect(buildCronDeleteCommand('$(rm -rf /)')).toBe(`openclaw cron rm '$(rm -rf /)' 2>&1`);
    expect(buildCronRunCommand('$(rm -rf /)')).toBe(`openclaw cron run '$(rm -rf /)' 2>&1`);
  });
});
