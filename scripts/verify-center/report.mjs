// Markdown-Bericht des Prüfzentrums (keine Secrets, keine Kundendaten).
const icon = v => ({ PASS: '✅ PASS', FAIL: '❌ FAIL', SKIP: '⏭ SKIP', NO_TESTS: '— keine', KNOWN_GAP: '⚠️ bekannte Lücke',
  KNOWN_BROKEN: '⚠️ vorbestehend defekt', PASS_UNEXPECTED: '✅ PASS (Lücke geschlossen?)', AVAILABLE: 'verfügbar', MANUAL: 'manuell', UNSUPPORTED: '⚠️ nicht unterstützt (vorbestehend)' }[v] ?? v ?? '—');
const sec = ms => (ms == null ? '' : `${Math.round(ms / 1000)} s`);

export function renderReport({ meta, results }) {
  const L = [];
  L.push(`# ANYVO Prüfzentrum – Bericht`, '');
  L.push(`| | |`, `|---|---|`);
  L.push(`| Ziel | \`${meta.branch}\` @ \`${meta.head}\` |`, `| Tree | \`${meta.tree}\` |`, `| Basis | \`${meta.base}\` |`);
  L.push(`| Werkzeug | verify-center @ \`${(meta.toolCommit ?? '?').slice(0, 12)}\` |`, `| Zeit | ${meta.startedAt} → ${meta.finishedAt} |`);
  if (meta.dirty.length) L.push(`| ⚠️ Arbeitskopie | ${meta.dirty.length} uncommittete Änderung(en) – NICHT geprüft (geprüft wird nur der Commit) |`);
  L.push('', '## Ergebnis je Ebene', '', '| Ebene | Ergebnis |', '|---|---|');
  for (const [k, name] of [['code', '1 Code'], ['db', '2 Datenbank'], ['app', '3 App']]) {
    if (results[k]) L.push(`| ${name} | ${icon(results[k].verdict)} |`); else L.push(`| ${name} | nicht gewählt |`);
  }
  if (results.error) L.push('', '**Werkzeugfehler:**', '```', results.error.slice(0, 3000), '```');

  const c = results.code;
  if (c) {
    L.push('', '## 1 Code', '');
    if (c.snapshot) L.push(`node_modules: \`${c.snapshot.nodeModulesFrom}\` (Lock HEAD exakt: ${c.snapshot.headLockExact ? 'ja' : 'nein'}, Basis exakt: ${c.snapshot.baseLockExact ? 'ja' : 'nein'})`, '');
    const k = c.checks ?? {};
    L.push('| Prüfung | Ergebnis | Details |', '|---|---|---|');
    if (k.typecheck) L.push(`| Typecheck | ${icon(k.typecheck.verdict)} | exit ${k.typecheck.exitCode}, ${k.typecheck.errors} Fehler, davon neu ${k.typecheck.newErrors.length} · ${sec(k.typecheck.ms)} |`);
    if (k.eslint) L.push(`| ESLint | ${icon(k.eslint.verdict)} | ${k.eslint.errors} Fehler / ${k.eslint.warnings} Warnungen (Basis ${k.eslint.baseErrors} Fehler), **neu ${k.eslint.newErrors?.length ?? '?'}** · ${sec(k.eslint.ms)} |`);
    if (k.testsAffected) L.push(`| Jest betroffen | ${icon(k.testsAffected.verdict)} | ${k.testsAffected.changedFiles} geänderte Dateien → ${k.testsAffected.passed ?? 0} bestanden, ${k.testsAffected.failed ?? 0} fehlgeschlagen ${k.testsAffected.note ? '(' + k.testsAffected.note + ')' : ''} |`);
    if (k.tests) L.push(`| Jest gesamt | ${icon(k.tests.verdict)} | ${k.tests.passed} bestanden, ${k.tests.failed} fehlgeschlagen (neu ${k.tests.newFailures.length}, instabil ${k.tests.flaky?.length ?? 0}), ${k.tests.skipped} übersprungen, ${k.tests.suites} Suiten · ${sec(k.tests.ms)} |`);
    if (k.diff) L.push(`| git diff --check | ${icon(k.diff.verdict)} | exit ${k.diff.exitCode} |`);
    const list = (title, items, fmt) => { if (items?.length) { L.push('', `**${title}:**`); for (const i of items.slice(0, 40)) L.push(`- ${fmt(i)}`); if (items.length > 40) L.push(`- … ${items.length - 40} weitere`); } };
    list('Neue Typfehler', k.typecheck?.newErrors, e => `\`${e.file}:${e.line}\` ${e.code} ${e.message}`);
    list('Neue ESLint-Fehler', k.eslint?.newErrors, e => `\`${e.file}:${e.line}\` ${e.rule}: ${e.message}`);
    list('Neue Testfehlschläge', k.tests?.newFailures, f => `\`${f.file}\` – ${f.test}`);
    list('Instabil (im Gesamtlauf rot, isoliert grün – kein Regressionsbeleg, beobachten)', k.tests?.flaky, f => `\`${f.file}\` – ${f.test}`);
    const pre = (k.tests?.failures ?? []).filter(f => ![...(k.tests.newFailures ?? []), ...(k.tests.flaky ?? [])].some(n => n.file === f.file && n.test === f.test));
    list('Vorbestehende Testfehlschläge (auch auf Basis)', pre, f => `\`${f.file}\` – ${f.test}`);
    if (c.receipt) {
      L.push('', `**Qualitätsbeleg** \`quality-evidence.json\` (Schema \`release-quality-evidence.mjs\` v1, Validator \`${c.receipt.validator}\`): ${c.receipt.ok ? 'gültig' : 'für Release noch nicht gültig'}`);
      for (const p of c.receipt.problems ?? []) L.push(`- ${p}`);
      L.push('', '_Der Beleg ist erst release-tauglich mit --platform/--runtime, absolut fehlerfreien Prüfungen und einem unabhängigen Review (Reviewer ≠ Erzeuger)._');
    }
    for (const n of c.notes ?? []) L.push(`- ${n}`);
  }

  const d = results.db;
  if (d) {
    L.push('', '## 2 Datenbank (lokale Wegwerf-Supabase, Docker)', '');
    if (d.docker) L.push(`Docker ${d.docker}; nur \`docker exec\` über Unix-Socket, keine Remote-Verbindung.`, '');
    if (d.steps?.length) {
      const counts = d.steps.reduce((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {});
      L.push(`**Schemaaufbau** (baseline + ${d.steps.length - 1} Schritte): ${Object.entries(counts).map(([k, v]) => `${icon(k)} ${v}`).join(' · ')}`);
      for (const s of d.steps.filter(s => s.status !== 'PASS')) L.push(`- ${icon(s.status)} \`${s.id}\` – ${s.reason ?? ''} ${s.error ? '`' + s.error + '`' : ''}`);
    }
    if (d.cases?.length) {
      L.push('', '**Regressionsfälle `supabase/local`**', '', '| Datei | Ergebnis | Details |', '|---|---|---|');
      for (const x of d.cases) L.push(`| \`${x.id}\` | ${icon(x.status)} | ${x.marker ?? x.reason ?? x.error ?? ''} |`);
    }
    for (const s of d.suites ?? []) {
      L.push('', `### Suite \`${s.name}\` – ${icon(s.verdict)}`, '', s.title ?? '', '');
      L.push('| Phase | Ergebnis | Assertions |', '|---|---|---|');
      for (const p of s.phases ?? []) L.push(`| ${p.phase} | ${icon(p.status)} | ${p.assertions ?? ''} |`);
      if (s.checks) {
        L.push('', `- Abbruchblock der Original-Migration greift: ${s.checks.guardActive ? 'ja' : '**nein**'} (lokal entfernt: ${s.checks.guardStrippedLocally})`);
        L.push(`- Migration zweimal angewendet (Idempotenz): ${s.phases.some(p => p.phase.endsWith('_POST') && p.status === 'PASS') ? 'ja' : 'nicht belegt'}`);
        L.push(`- Negativkontrolle (POST ohne Migration scheitert): ${s.checks.negativeControlFails ? 'ja' : '**nein – Tests nicht trennscharf**'}${s.checks.negativeControlError ? ' – `' + s.checks.negativeControlError + '`' : ''}`);
        L.push(`- Keine Rückstände nach ROLLBACK: ${s.checks.noResidue ? 'ja' : '**nein**'}`);
      }
      if (s.error) L.push(`- Fehler: \`${s.error}\``);
      if (s.info?.length) { L.push('', '**Fachliche Hinweise (kein FAIL, Entscheidung nötig):**'); for (const i of s.info) L.push(`- \`${i.id}\`: ${i.detail}`); }
    }
    for (const n of d.notes ?? []) L.push(`- ${n}`);
  }

  const a = results.app;
  if (a) {
    L.push('', '## 3 App (ohne Gerät)', '', '| Werkzeug | Status |', '|---|---|');
    L.push(`| xcode-select | \`${a.tools.xcodeSelect}\` (volles Xcode: ${a.tools.fullXcode ? 'ja' : 'nein'}) |`);
    L.push(`| simctl / xcodebuild | ${a.tools.simctl ? 'ja' : 'nein'} / ${a.tools.xcodebuild ? 'ja' : 'nein'} |`);
    L.push(`| adb / Android-Emulator | ${a.tools.adb ? 'ja' : 'nein'} / ${a.tools.emulator ? 'ja' : 'nein'} |`);
    L.push(`| react-native-web installiert | ${a.tools.reactNativeWeb ? 'ja' : 'nein'} |`);
    L.push('', '| Prüfung | Ergebnis | Details |', '|---|---|---|');
    for (const [k, v] of Object.entries(a.checks)) L.push(`| ${k} | ${icon(v.verdict)} | ${v.reason ?? v.error ?? (v.ms ? sec(v.ms) : '')} |`);
    for (const n of a.notes ?? []) L.push('', `_${n}_`);
  }
  L.push('', '---', '_Lokale Prüfung. Keine Aussage über Staging/Production, keine Geräteabnahme. Kein Commit, Push, Build, OTA oder DB-Write ausserhalb der Wegwerf-Instanz._');
  return L.join('\n') + '\n';
}
