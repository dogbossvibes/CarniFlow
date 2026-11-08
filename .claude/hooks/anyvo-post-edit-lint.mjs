#!/usr/bin/env node
// ANYVO PostToolUse-Hook: ESLint (nur Fehler) für die gerade bearbeitete Datei.
// Lesend; ändert keine Dateien (kein --fix). Bei Lint-Fehlern Exit 2, damit Claude
// die Meldung sieht und korrigiert. Fehlt node_modules, wird still übersprungen.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP = /(^|\/)(node_modules|dist|ios|android|_bmad|\.agents|\.claude\/skills)\//;

export function lintTarget(input, projectDir) {
  const file = input?.tool_input?.file_path || '';
  if (!file || !projectDir) return null;
  const abs = resolve(projectDir, file);
  const rel = relative(projectDir, abs);
  if (rel.startsWith('..') || !LINTABLE.test(rel) || SKIP.test(rel)) return null;
  return rel;
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ? resolve(process.env.CLAUDE_PROJECT_DIR) : null;
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const rel = lintTarget(input, projectDir);
  if (!rel || !existsSync(join(projectDir, rel))) process.exit(0);
  const eslint = join(projectDir, 'node_modules/.bin/eslint');
  if (!existsSync(eslint)) process.exit(0);
  try {
    execFileSync(eslint, ['--quiet', '--no-warn-ignored', rel], { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 45000 });
  } catch (e) {
    if (e.status === 1) {
      process.stderr.write(`ESLint-Fehler in ${rel} (ANYVO Post-Edit-Check):\n${String(e.stdout || '').slice(0, 4000)}`);
      process.exit(2);
    }
    // Werkzeugfehler/Timeout blockieren nicht, werden aber nicht als bestanden gemeldet.
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
