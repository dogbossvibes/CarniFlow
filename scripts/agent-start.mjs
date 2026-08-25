#!/usr/bin/env node
// ANYVO — Agent-Session-Start (AUSSCHLIESSLICH LESEND).
// Kompakte Übersicht beim Übernehmen einer Session. Ändert nichts.
import {
  isGitRepo, gitBranch, gitStatusShort, gitModified, gitUntracked,
  readHandoff, parseAuto, parseManualField, newestChangeMs,
} from './agent-lib.mjs';

const { exists, text } = readHandoff();
const auto = exists ? parseAuto(text) : { generated: null, agent: null };
const task = exists ? parseManualField(text, 'Current task') : null;
const next = exists ? parseManualField(text, 'Next recommended step') : null;

const branch = isGitRepo() ? gitBranch() : '(kein Git-Repository)';
const status = gitStatusShort();

const warnings = [];
if (!exists) warnings.push('Kein Handoff vorhanden.');
else if (auto.generated && newestChangeMs() > auto.generated.getTime())
  warnings.push('Handoff evtl. veraltet — Repository-Änderungen sind neuer als der Handoff.');

console.log('AGENT SESSION START');
console.log('─'.repeat(48));
console.log(`Branch            : ${branch}`);
console.log(`Last handoff      : ${auto.generated ? auto.generated.toISOString() : '(keiner)'}`);
console.log(`Last agent        : ${auto.agent ?? '(keiner)'}`);
console.log(`Current task      : ${task ?? '(nicht gepflegt)'}`);
console.log(`Next recommended  : ${next ?? '(nicht gepflegt)'}`);
console.log(`Git status        : ${status ? status.split('\n').length + ' Einträge' : 'sauber'}`);
console.log('Modified files    :');
console.log(gitModified().slice(0, 15).map(f => '  • ' + f).join('\n') || '  (keine)');
console.log('Warnings          :');
console.log(warnings.length ? warnings.map(w => '  ⚠ ' + w).join('\n') : '  (keine)');
console.log('');
console.log('Verbindliches Startprotokoll:');
console.log('  1. AGENTS.md');
console.log('  2. docs/agent/CURRENT_STATE.md');
console.log('  3. docs/agent/SESSION_HANDOFF.md — letzte Übergabe');
console.log('  4. docs/agent/TASKS.md — verbindliche Aufgabenquelle');
console.log('  5. docs/agent/DECISIONS.md');
console.log('  6. git status --short');
console.log('  7. git branch --show-current');
console.log('  8. npm run agent:status');
console.log('');
console.log('TASKS.md ist maßgeblich für Task-IDs, Status und nächste TASK-ID.');
console.log('SESSION_HANDOFF.md beschreibt die letzte Übergabe und kann veraltet sein.');
console.log('Priorität: Repository state > Git state > Handoff documentation > Agent assumptions.');
