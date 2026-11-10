import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(path, 'utf8');

describe('BMAD und Claude: schlanke Arbeitsregeln', () => {
  it('BMAD läuft nur auf Wunsch bzw. bei grossen/unklaren Funktionen', () => {
    const agents = text('AGENTS.md');
    expect(agents).toContain('BMAD (`docs/agent/BMAD.md`) nur auf ausdrücklichen');
    expect(text('docs/agent/BMAD.md')).toContain('BMAD nur noch auf ausdrücklichen Wunsch');
  });
  it('verwendet aktuelle Arbeitsquellen statt historischer Handoffs als Aufgabenwahrheit', () => {
    const doc = text('docs/agent/BMAD.md');
    expect(doc).toContain('| Aktive Arbeit, Owner und Stops | `ACTIVE_WORK.md`');
    expect(doc).not.toContain('| Aktive Arbeit und Übergabe | `SESSION_HANDOFF.md`');
    expect(doc).toContain('| Historisches Task-Ledger | `TASKS.md`; keine ID-Vergabe daraus |');
  });
  it('CLAUDE.md importiert AGENTS.md; die OTA-Regel steht genau einmal in AGENTS.md', () => {
    const agents = text('AGENTS.md');const claude = text('CLAUDE.md');
    const heading = '## ANYVO Production OTA — zwingende Regel';
    expect(claude.split('\n')[0]).toBe('@AGENTS.md');
    expect(agents.split(heading).length).toBe(2);
    expect(agents.indexOf('## Arbeitsweise')).toBeLessThan(agents.indexOf(heading));
  });
});
