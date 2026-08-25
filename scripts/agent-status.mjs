#!/usr/bin/env node
// ANYVO — Agent-Status (AUSSCHLIESSLICH LESEND).
// Zeigt aktuellen Agent-Kontext, Git-Zustand und eine konservative Stale-Warnung.
// Ändert nichts, ruft nichts Remote auf.
import {
  isGitRepo, gitBranch, gitStatusShort, gitModified, gitUntracked,
  readHandoff, parseAuto, parseManualField, newestChangeMs, HANDOFF_PATH,
} from './agent-lib.mjs';

const rel = (p) => p.replace(process.cwd() + '/', '');

const { exists, text } = readHandoff();
const auto = exists ? parseAuto(text) : { generated: null, agent: null };
const task = exists ? parseManualField(text, 'Current task') : null;

const branch = isGitRepo() ? gitBranch() : '(kein Git-Repository)';
const status = gitStatusShort();
const modified = gitModified();
const untracked = gitUntracked();

const list = (arr, max = 20) =>
  arr.length === 0 ? '  (keine)' :
  arr.slice(0, max).map(f => `  • ${f}`).join('\n') + (arr.length > max ? `\n  … +${arr.length - max} weitere` : '');

console.log('ANYVO — AGENT STATUS');
console.log('─'.repeat(48));
console.log(`Current agent context : ${auto.agent ?? '(kein Handoff)'}`);
console.log(`Current branch        : ${branch}`);
console.log(`Last handoff          : ${auto.generated ? auto.generated.toISOString() : '(keiner)'}`);
console.log(`Last handoff agent    : ${auto.agent ?? '(keiner)'}`);
console.log(`Current task          : ${task ?? '(nicht gepflegt)'}`);
console.log(`Handoff file          : ${exists ? rel(HANDOFF_PATH) : 'FEHLT (' + rel(HANDOFF_PATH) + ')'}`);
console.log('');
console.log(`Git status (${status ? status.split('\n').length : 0} Einträge):`);
console.log(status ? status.split('\n').map(l => '  ' + l).join('\n') : '  (sauber)');
console.log('');
console.log('Modified files:');
console.log(list(modified));
console.log('');
console.log('Untracked files:');
console.log(list(untracked));
console.log('');

// ── Stale-Erkennung (konservativ) ─────────────────────────────────────────
console.log('Warnings:');
const warnings = [];
if (!exists) {
  warnings.push('Kein SESSION_HANDOFF.md gefunden. Erzeuge einen mit: npm run agent:handoff -- --agent=<opencode|codex>');
} else if (!auto.generated) {
  warnings.push('Handoff enthält keinen gültigen Generated-Timestamp — Aktualität unklar.');
} else {
  const newest = newestChangeMs();
  if (newest > auto.generated.getTime()) {
    warnings.push('Handoff may be stale. Repository contains changes newer than the last handoff.');
  }
}
console.log(warnings.length ? warnings.map(w => '  ⚠ ' + w).join('\n') : '  (keine)');
console.log('');
console.log('Hinweis: Bei Widerspruch gilt der tatsächliche Repository-Zustand, nicht dieser Handoff.');
