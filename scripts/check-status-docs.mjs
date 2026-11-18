#!/usr/bin/env node
// ANYVO — Statusdoku-Abgleich (AUSSCHLIESSLICH LESEND).
// Vergleicht den obersten Abschnitt von ANYVO_MASTER_STATUS.md und ACTIVE_WORK.md mit dem
// tatsächlichen Git-Stand und meldet Widersprüche. Ändert nichts, ruft nichts Remote auf
// (kein EAS, kein GitHub-API): Issue-Zustände und der Production-Stand werden NICHT geprüft.
//
// Aufruf:  npm run status:check            (Bericht, Exit 0)
//          npm run status:check -- --strict (Exit 1 bei Befunden)
// Optionen: --ref <git-ref> (Standard HEAD), --recent <n> (Standard 30), --ledger-days <n> (Standard 7)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const STATUS_DOCS = ['docs/agent/ANYVO_MASTER_STATUS.md', 'docs/agent/ACTIVE_WORK.md'];
export const LEDGER_PATH = 'docs/agent/ota-ledger.json';

/** Oberster `## `-Abschnitt (Überschrift und Text bis zur nächsten `## `-Überschrift). */
export function topSection(markdown) {
  const lines = String(markdown).split('\n');
  const start = lines.findIndex(l => l.startsWith('## '));
  if (start < 0) return { heading: null, body: '' };
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return { heading: lines[start].slice(3).trim(), body: lines.slice(start + 1, end).join('\n') };
}

/** Listenpunkte eines Abschnitts; eingerückte Folgezeilen gehören zum Punkt davor. */
export function bullets(body) {
  const out = [];
  for (const line of String(body).split('\n')) {
    if (/^\s*[-*] /.test(line)) out.push(line.replace(/^\s*[-*] /, '').trim());
    else if (/^\s+\S/.test(line) && out.length) out[out.length - 1] += ' ' + line.trim();
  }
  return out;
}

const prNumbers = text => [...String(text).matchAll(/PRs? #(\d+)/g)].map(m => Number(m[1]));

/** PR-Nummern, die ein Listenpunkt als noch offen bzw. noch zu mergen führt. */
export function claimedOpenPrs(body) {
  const found = new Set();
  for (const b of bullets(body)) {
    if (/gemergt|geschlossen/i.test(b)) continue;
    if (!/\boffen\b|\bmergen\b/i.test(b)) continue;
    for (const n of prNumbers(b)) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/** PR-Nummer aus dem Betreff eines Merge- oder Squash-Commits, sonst null. */
export function prFromSubject(subject) {
  const m = /^Merge pull request #(\d+)\b/.exec(subject) ?? /\(#(\d+)\)\s*$/.exec(subject);
  return m ? Number(m[1]) : null;
}

export const isDocsOnly = files => files.length > 0 && files.every(f => /^docs\/.*\.md$/.test(f));

/** Jüngstes Datum (JJJJ-MM-TT) in einer Abschnittsüberschrift, sonst null. */
export const headingDate = heading => (/\b(\d{4}-\d{2}-\d{2})\b/.exec(heading ?? '') ?? [])[1] ?? null;

export function newestLedgerDate(ledger) {
  const dates = (Array.isArray(ledger) ? ledger : []).map(e => e?.createdAt).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1].slice(0, 10) : null;
}

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Reiner Abgleich ohne Git- oder Dateizugriff.
 * docs:   [{ path, text }]
 * merged: [{ pr, sha, subject, docsOnly }] – jüngste zuerst
 * ledger: Inhalt von ota-ledger.json (Array) oder null
 */
export function findFindings({ docs, merged, ledger, ledgerDays = 7 }) {
  const findings = [];
  const mergedByPr = new Map(merged.map(m => [m.pr, m]));
  let newestHeading = null;

  for (const { path, text } of docs) {
    const { heading, body } = topSection(text);
    if (!heading) { findings.push({ kind: 'kein-abschnitt', path, text: `${path}: kein «## »-Abschnitt gefunden.` }); continue; }
    const date = headingDate(heading);
    if (date && (!newestHeading || date > newestHeading)) newestHeading = date;
    for (const pr of claimedOpenPrs(body)) {
      const m = mergedByPr.get(pr);
      if (m) findings.push({ kind: 'pr-offen-aber-gemergt', path, pr,
        text: `${path}: PR #${pr} steht als offen, ist aber gemergt (${m.sha.slice(0, 7)}).` });
    }
  }

  const allText = docs.map(d => d.text).join('\n');
  for (const m of merged) {
    if (m.docsOnly) continue;
    if (new RegExp(`#${m.pr}\\b`).test(allText)) continue;
    findings.push({ kind: 'pr-gemergt-nicht-erwaehnt', pr: m.pr,
      text: `PR #${m.pr} ist gemergt (${m.sha.slice(0, 7)}), kommt in der Statusdoku aber nicht vor: ${m.subject}` });
  }

  const ledgerDate = newestLedgerDate(ledger);
  if (ledger && newestHeading && ledgerDate && dayDiff(ledgerDate, newestHeading) > ledgerDays) {
    findings.push({ kind: 'ledger-veraltet',
      text: `${LEDGER_PATH}: jüngster Eintrag ${ledgerDate}, Statusdoku nennt ${newestHeading}. ` +
        'Vor dem nächsten nativen Build auffrischen (npm run release:refresh:ota-ledger).' });
  }
  return findings;
}

// ── Git-Zugriff (nur lesend) ────────────────────────────────────────────────
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Die letzten `recent` gemergten PRs auf `ref`, samt Kennzeichen «nur Doku». */
export function readMergedPrs({ cwd = process.cwd(), ref = 'HEAD', recent = 30, scan = 400 } = {}) {
  const out = git(['log', '--first-parent', `-${scan}`, '--format=%H%x09%s', ref], cwd);
  const merged = [];
  for (const line of out.split('\n')) {
    const [sha, subject] = line.split('\t');
    const pr = prFromSubject(subject ?? '');
    if (pr == null) continue;
    let files = [];
    try { files = git(['diff', '--name-only', `${sha}^1`, sha], cwd).split('\n').filter(Boolean); } catch { /* Wurzel-Commit */ }
    merged.push({ pr, sha, subject, docsOnly: isDocsOnly(files) });
  }
  // Ältere PRs nur für den «offen, aber gemergt»-Abgleich behalten; «nicht erwähnt» gilt für die jüngsten.
  return merged.map((m, i) => (i < recent ? m : { ...m, docsOnly: true }));
}

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), log = console.log } = {}) {
  const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const strict = argv.includes('--strict');
  const ref = opt('--ref') ?? 'HEAD';
  const read = p => readFileSync(`${cwd}/${p}`, 'utf8');

  const missing = STATUS_DOCS.filter(p => !existsSync(`${cwd}/${p}`));
  if (missing.length) { log(`FEHLT: ${missing.join(', ')}`); return 2; }

  const docs = STATUS_DOCS.map(path => ({ path, text: read(path) }));
  let ledger = null;
  try { ledger = JSON.parse(read(LEDGER_PATH)); } catch { /* ohne Verzeichnis kein Ledger-Abgleich */ }
  const merged = readMergedPrs({ cwd, ref, recent: Number(opt('--recent') ?? 30) });
  const findings = findFindings({ docs, merged, ledger, ledgerDays: Number(opt('--ledger-days') ?? 7) });

  log('ANYVO — STATUSDOKU-ABGLEICH (nur lesend)');
  log('─'.repeat(48));
  log(`Git-Stand   : ${ref} ${git(['rev-parse', '--short', ref], cwd)}`);
  for (const d of docs) log(`Abschnitt   : ${d.path} → ${topSection(d.text).heading ?? '(keiner)'}`);
  log('');
  if (!findings.length) log('Keine Abweichung zwischen Statusdoku und Git gefunden.');
  else { log(`${findings.length} Abweichung(en):`); for (const f of findings) log(`  ⚠ ${f.text}`); }
  log('');
  log('Nicht geprüft: Production-Stand in EAS, Stores, Zustand von Issues. Statusdoku schreibt nur der MASTER.');
  return findings.length && strict ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main());
