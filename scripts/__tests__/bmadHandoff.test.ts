import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(path, 'utf8');

describe('BMAD und Claude: verbindliche Übergabequellen', () => {
  it('kennzeichnet den tatsächlichen übergebenden Agenten', () => {
    const handoff = text('AGENTS.md').split('## When handing off between Codex and Claude')[1]?.split('\n## ')[0] ?? '';
    expect(handoff).toContain('--agent=<current-agent>');
    expect(handoff).toContain('`claude` for Claude Code');
    expect(handoff).toContain('`codex` for Codex');
  });
  it('verwendet aktuelle Arbeitsquellen statt historischer Handoffs als Aufgabenwahrheit', () => {
    const doc = text('docs/agent/BMAD.md');
    expect(doc).toContain('| Aktive Arbeit, Owner und Stops | `ACTIVE_WORK.md`');
    expect(doc).toContain('| Aufgaben-IDs | Gemeinsame atomare Taskregistry');
    expect(doc).not.toContain('| Aktive Arbeit und Übergabe | `SESSION_HANDOFF.md`');
    expect(doc).toContain('| Historisches Task-Ledger | `TASKS.md`; keine ID-Vergabe daraus |');
  });
  it('hält agentenspezifische BMAD-Ergänzungen außerhalb der identischen OTA-Regeln', () => {
    const agents = text('AGENTS.md');const claude = text('CLAUDE.md');
    const heading = '## ANYVO Production OTA — zwingende Regel';
    expect(agents.indexOf('# BMAD — schlanker Anyvo-Ablauf / Claude-Übergang')).toBeLessThan(agents.indexOf(heading));
    expect(claude.indexOf('## BMAD and transfer from Codex')).toBeLessThan(claude.indexOf(heading));
    expect(agents.slice(agents.indexOf(heading))).toBe(claude.slice(claude.indexOf(heading)));
  });
});
