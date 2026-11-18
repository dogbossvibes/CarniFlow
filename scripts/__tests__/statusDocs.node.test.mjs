import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  topSection, bullets, claimedOpenPrs, prFromSubject, isDocsOnly, headingDate, newestLedgerDate, findFindings,
} from '../check-status-docs.mjs';

const sha = n => String(n).repeat(40).slice(0, 40);
const doc = (heading, body) => `# Titel\n\n## ${heading}\n\n${body}\n\n## Älterer Abschnitt – 2026-11-01\n\n- PR #5 offen.\n`;

test('topSection returns only the first section', () => {
  const s = topSection(doc('Stand – 2026-11-18', '- A\n- B'));
  assert.equal(s.heading, 'Stand – 2026-11-18');
  assert.ok(!s.body.includes('PR #5'));
  assert.deepEqual(topSection('ohne Abschnitt'), { heading: null, body: '' });
});

test('bullets join indented continuation lines', () => {
  assert.deepEqual(bullets('- PR #178 (Start) offen; Merge\n  entscheidet die Nutzerin.\n- zweiter'),
    ['PR #178 (Start) offen; Merge entscheidet die Nutzerin.', 'zweiter']);
});

test('claimedOpenPrs finds open and to-be-merged PRs, not merged ones', () => {
  const body = [
    '- PR #178 (OTA-Startprüfung) offen; Merge entscheidet die Nutzerin.',
    '- **PR #190** mergen (Nutzerin), danach eigene OTA.',
    '- PR #179 (T-214) ist gemergt, aber bewusst nicht ausgeliefert: offen bleibt der Feldtest.',
    '- Gerätenachkontrolle #176 offen.',
  ].join('\n');
  assert.deepEqual(claimedOpenPrs(body), [178, 190]);
});

test('prFromSubject reads merge and squash subjects', () => {
  assert.equal(prFromSubject('Merge pull request #178 from dogbossvibes/feat/x'), 178);
  assert.equal(prFromSubject('docs(agent): Stand nachgeführt (#181)'), 181);
  assert.equal(prFromSubject('fix(faehrten): Winkel (T-215)'), null);
});

test('isDocsOnly accepts only markdown below docs/', () => {
  assert.equal(isDocsOnly(['docs/agent/ACTIVE_WORK.md']), true);
  assert.equal(isDocsOnly(['docs/agent/ota-ledger.json']), false);
  assert.equal(isDocsOnly(['docs/a.md', 'scripts/x.mjs']), false);
  assert.equal(isDocsOnly([]), false);
});

test('headingDate and newestLedgerDate', () => {
  assert.equal(headingDate('Stand nach OTA #180 – 2026-11-18'), '2026-11-18');
  assert.equal(headingDate('ohne Datum'), null);
  assert.equal(newestLedgerDate([{ createdAt: '2026-11-01T00:00:00Z' }, { createdAt: '2026-11-07T16:29:56Z' }]), '2026-11-07');
  assert.equal(newestLedgerDate(null), null);
});

test('findFindings reports open-but-merged, unmentioned merges and a stale ledger', () => {
  const text = doc('Stand – 2026-11-18', '- PR #178 offen; Merge entscheidet die Nutzerin.\n- PR #179 ist gemergt.');
  const merged = [
    { pr: 182, sha: sha('a'), subject: 'Merge pull request #182 from x/y', docsOnly: false },
    { pr: 181, sha: sha('b'), subject: 'Merge pull request #181 from x/docs', docsOnly: true },
    { pr: 179, sha: sha('c'), subject: 'Merge pull request #179 from x/z', docsOnly: false },
    { pr: 178, sha: sha('d'), subject: 'Merge pull request #178 from x/w', docsOnly: false },
  ];
  const f = findFindings({ docs: [{ path: 'a.md', text }], merged, ledger: [{ createdAt: '2026-11-07T00:00:00Z' }] });
  assert.deepEqual(f.map(x => [x.kind, x.pr ?? null]), [
    ['pr-offen-aber-gemergt', 178],
    ['pr-gemergt-nicht-erwaehnt', 182],
    ['ledger-veraltet', null],
  ]);
});

test('findFindings is quiet when docs match git and the ledger is fresh', () => {
  const text = doc('Stand – 2026-11-18', '- PR #178 ist gemergt.\n- PR #200 offen.');
  const merged = [{ pr: 178, sha: sha('d'), subject: 'Merge pull request #178 from x/w', docsOnly: false }];
  assert.deepEqual(findFindings({ docs: [{ path: 'a.md', text }], merged, ledger: [{ createdAt: '2026-11-15T00:00:00Z' }] }), []);
});

test('an issue number alone does not count as a mention of a different PR', () => {
  const text = doc('Stand – 2026-11-18', '- Karte #18 erledigt.');
  const merged = [{ pr: 182, sha: sha('a'), subject: 'Merge pull request #182 from x/y', docsOnly: false }];
  assert.equal(findFindings({ docs: [{ path: 'a.md', text }], merged, ledger: null }).length, 1);
});
