#!/usr/bin/env node
// ANYVO — Agent-Handoff-Generator.
// Aktualisiert AUSSCHLIESSLICH den AUTO-GENERATED-Block in docs/agent/SESSION_HANDOFF.md.
// Manuell gepflegte Abschnitte bleiben unangetastet.
//
// Führt NIEMALS aus: commit, push, reset, checkout, clean, Branch-Wechsel,
// Datei-Löschung, Tests, Remote-/DB-Zugriffe. Nur lesende Git-Kommandos.
//
//   node scripts/agent-handoff.mjs --agent=opencode|codex|claude|unknown
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  HANDOFF_PATH, MARKER_START, MARKER_END, VALID_AGENTS,
  gitBranch, gitStatusShort, gitDiffStat, gitModified, gitUntracked,
  gitRecentCommits, nodeVersion, packageManager, readHandoff, isGitRepo,
} from './agent-lib.mjs';

// ── Agent-Parameter (sicher) ──────────────────────────────────────────────
function parseAgent(argv) {
  const arg = argv.find(a => a.startsWith('--agent='));
  if (!arg) return 'unknown';                       // nicht raten
  const val = arg.slice('--agent='.length).trim().toLowerCase();
  if (VALID_AGENTS.includes(val)) return val;
  console.warn(`⚠ Unbekannter --agent="${val}" → verwende "unknown". Gültig: ${VALID_AGENTS.join(', ')}`);
  return 'unknown';
}

const fence = (s) => '```\n' + (s && s.length ? s : '(leer)') + '\n```';

// ── Auto-Block bauen ──────────────────────────────────────────────────────
function buildAutoBlock(agent) {
  const generated = new Date().toISOString();
  const branch = isGitRepo() ? gitBranch() : '(kein Git-Repository)';
  const status = gitStatusShort();
  const diffstat = gitDiffStat();
  const modified = gitModified();
  const untracked = gitUntracked();
  const commits = gitRecentCommits(5);

  return [
    MARKER_START,
    '',
    `Generated: ${generated}`,
    `Agent: ${agent}`,
    `Branch: ${branch}`,
    '',
    '### Git status',
    fence(status),
    '',
    '### Diff stat',
    fence(diffstat),
    '',
    '### Modified files',
    fence(modified.join('\n')),
    '',
    '### Untracked files',
    fence(untracked.join('\n')),
    '',
    '### Recent commits',
    fence(commits),
    '',
    '### Runtime',
    fence(`Node: ${nodeVersion()}\nPackage manager: ${packageManager()}`),
    '',
    MARKER_END,
  ].join('\n');
}

// ── Vorlage für eine neue Datei (Auto-Block + manuelle Abschnitte) ─────────
function template(autoBlock) {
  return `# Agent Session Handoff

> Aktuellster Handoff zwischen **OpenCode** und **OpenAI Codex**.
> Der Block zwischen den AUTO-GENERATED-Markern wird von \`scripts/agent-handoff.mjs\` erzeugt —
> **nicht manuell** bearbeiten. Alles ausserhalb der Marker wird von den Agenten **manuell** gepflegt.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**
> Der tatsächliche Repository-Zustand hat immer Vorrang vor dieser Doku.

${autoBlock}

## Current task
_TBD_

## Goal
_TBD_

## Work completed
_TBD_

## Tests / verification
_TBD_

## Known issues
_TBD_

## Important context
_TBD_

## Do not touch
_TBD_

## Next recommended step
_TBD_

## Relevant files
_TBD_

## Open questions
_TBD_
`;
}

// ── Auto-Block in bestehende Datei einsetzen (manuellen Teil bewahren) ─────
function replaceAutoBlock(text, autoBlock) {
  const s = text.indexOf(MARKER_START);
  const e = text.indexOf(MARKER_END);
  if (s !== -1 && e !== -1 && e > s) {
    return text.slice(0, s) + autoBlock + text.slice(e + MARKER_END.length);
  }
  // Marker fehlen: Auto-Block direkt nach dem ersten Heading (H1) einfügen,
  // ohne bestehenden manuellen Inhalt zu verlieren.
  const lines = text.split('\n');
  const h1 = lines.findIndex(l => l.startsWith('# '));
  const insertAt = h1 === -1 ? 0 : h1 + 1;
  lines.splice(insertAt, 0, '', autoBlock, '');
  return lines.join('\n');
}

// ── Ausführung ────────────────────────────────────────────────────────────
const agent = parseAgent(process.argv.slice(2));
const autoBlock = buildAutoBlock(agent);
const { exists, text } = readHandoff();

mkdirSync(dirname(HANDOFF_PATH), { recursive: true });   // legt docs/agent/ an, falls nötig
const next = exists ? replaceAutoBlock(text, autoBlock) : template(autoBlock);
writeFileSync(HANDOFF_PATH, next);

console.log(`✓ Handoff aktualisiert: docs/agent/SESSION_HANDOFF.md`);
console.log(`  Agent:  ${agent}`);
console.log(`  Branch: ${isGitRepo() ? gitBranch() : '(kein Git-Repository)'}`);
console.log(`  ${exists ? 'AUTO-GENERATED-Block ersetzt (manuelle Abschnitte unverändert).' : 'Neue Datei aus Vorlage erstellt.'}`);
console.log('');
console.log('Hinweis: KEIN Commit, KEIN Push, KEIN Reset ausgeführt. Bitte die manuellen');
console.log('Abschnitte (Current task, Work completed, …) vor dem Wechsel selbst pflegen.');
