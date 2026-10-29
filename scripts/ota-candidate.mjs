// Policy/state for the EXISTING update-production wrapper. No provider calls.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, realpathSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { relative, isAbsolute, sep, join } from 'node:path';
import { validateQualityEvidence } from './release-quality-evidence.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
export function readJson(path) {
  const s = lstatSync(path);
  if (!s.isFile() || s.size > 2 * 1024 * 1024) throw new Error('INVALID_RELEASE_ARTIFACT');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function externalFile(path, root) {
  const actual = realpathSync(path), rel = relative(realpathSync(root), actual);
  if (!(isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep))) throw new Error('ARTIFACT_INSIDE_SOURCE');
  return actual;
}
export function artifact(path, root) {
  path = externalFile(path, root);
  const s = lstatSync(path);
  if (!s.isFile() || s.size > 32 * 1024 * 1024) throw new Error('INVALID_RELEASE_ARTIFACT');
  return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
}
function proof(value, root) {
  if (!value || artifact(value.path, root).sha256 !== value.sha256) throw new Error('MISSING_OR_CHANGED_EVIDENCE');
}
export function writeNew(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export function riskFor(paths, changes) {
  const ranks = { low: 0, medium: 1, high: 2 };
  let rank = 0;const areas = new Set();
  for (const c of changes ?? []) {
    if (!c || typeof c.description !== 'string' || !c.description.trim() || !Object.hasOwn(ranks, c.risk)) throw new Error('INVALID_CHANGE_SCOPE');
    rank = Math.max(rank, ranks[c.risk]);
    for (const a of c.areas ?? []) {
      if (!['ui', 'navigation', 'forms', 'calendar', 'journal', 'tracking', 'auth', 'subscriptions', 'database', 'privacy', 'permissions', 'offline'].includes(a)) throw new Error('UNKNOWN_RISK_AREA');
      areas.add(a);
      rank = Math.max(rank, ['tracking', 'auth', 'subscriptions', 'database', 'privacy', 'permissions', 'offline'].includes(a) ? 2 : a === 'ui' ? 0 : 1);
    }
  }
  const rules = [
    [/tracking|\/track\/|sensors?|motion|location/i, 'tracking'], [/auth|session-context|supabase\.ts/i, 'auth'],
    [/subscription|purchases|revenuecat|quota/i, 'subscriptions'], [/supabase\/|migrations?\/|database|sqlite/i, 'database'],
    [/privacy|consent/i, 'privacy'], [/permission/i, 'permissions'], [/offline|persist|recovery|localStore/i, 'offline'],
  ];
  for (const path of paths) {
    for (const [re, area] of rules) if (re.test(path)) { rank = 2;areas.add(area); }
    if (/navigation|calendar|journal|training|\/unit\/|form/i.test(path)) rank = Math.max(rank, 1);
  }
  if (rank === 2 && ![...areas].some(a => !['ui', 'navigation', 'forms', 'calendar', 'journal'].includes(a))) areas.add('privacy');
  return { level: ['low', 'medium', 'high'][rank], areas: [...areas].sort() };
}
export function qaProblems(plan, context, quality, root) {
  const problems = [];
  try {
    if (quality.checks?.process?.exitCode !== 0) throw new Error();
    proof(quality.checks.process.evidence, root);
  } catch { problems.push('Offline-Release-/Prozess-Regressionstests fehlen oder sind fehlgeschlagen.'); }
  try {
    const b = plan.bundle;
    if (b?.status !== 'PASS' || b.sourceCommit !== context.source.commit || b.platform !== context.target.platform || b.runtime !== context.target.runtime
      || b.environment !== 'production' || !Array.isArray(b.assets)) throw new Error();
    proof(b.evidence, root);proof(b.launchAsset, root);for (const a of b.assets) proof(a, root);
  } catch { problems.push('Vorab geprüfte Production-Bundle-/Assetbelege am exakten Commit fehlen.'); }
  try {
    const backup = plan.sourceBackup;
    if (backup?.status !== 'PASS' || backup.commit !== context.source.commit || backup.repository !== 'dogbossvibes/CarniFlow' || !backup.ref) throw new Error();
    proof(backup.evidence, root);
  } catch { problems.push('GitHub-Sicherung am exakten Commit fehlt. Keine Pushfreigabe aus OTA ableiten.'); }
  if (context.risk.level !== 'low' || plan.functionalQA !== undefined) {
    try {
      const f = plan.functionalQA;
      if (f?.status !== 'PASS' || f.sourceCommit !== context.source.commit || f.platform !== context.target.platform || f.runtime !== context.target.runtime
        || !Array.isArray(f.scenarios) || !f.scenarios.length || !f.scenarios.every(s => typeof s === 'string' && s.trim())) throw new Error();
      proof(f.evidence, root);
    } catch { problems.push('Funktionaler Regressionsnachweis fehlt.'); }
  }
  if (context.risk.level === 'high' || plan.deviceQA !== undefined) {
    if (context.risk.level === 'high' && quality.checks?.tests?.fullSuite !== true) problems.push('Hohes Risiko verlangt vollständige Testsuite.');
    try {
      const q = plan.deviceQA;
      if (q?.status !== 'PASS' || q.kind !== 'physical-device' || !q.deviceModel || !q.osVersion || !Number.isFinite(Date.parse(q.performedAt))
        || q.sourceCommit !== context.source.commit || q.platform !== context.target.platform || q.runtime !== context.target.runtime || q.nativeBuildId !== context.native.buildId
        || !Array.isArray(q.scenarios) || !q.scenarios.length || !q.scenarios.every(s => s.description && s.result === 'PASS')) throw new Error();
      const required = context.risk.areas.filter(a => ['tracking', 'auth', 'subscriptions', 'database', 'privacy', 'permissions', 'offline'].includes(a));
      if (!required.every(a => q.scenarios?.some(s => s.area === a && s.result === 'PASS' && s.description))) throw new Error();
      proof(q.evidence, root);
    } catch { problems.push('Relevante echte Geräteabnahme fehlt, ist fehlgeschlagen oder passt nicht zum Kandidaten. Bei hohem Risiko ersetzen Unit-Tests sie nicht.'); }
  }
  return problems;
}
export function createCandidate({ context, plan, qualityFile, root }) {
  if (!plan?.changes?.length || !plan.testRationale?.trim() || !Array.isArray(plan.regressions) || !plan.regressions.length || !plan.regressions.every(s => typeof s === 'string' && s.trim())) throw new Error('CHANGE_SCOPE_OR_TEST_RATIONALE_MISSING');
  const q = artifact(qualityFile, root), quality = readJson(q.path);
  const check = validateQualityEvidence({ receiptPath: q.path, head: context.source.commit, tree: context.source.tree,
    platform: context.target.platform, runtime: context.target.runtime, repositoryRoot: root });
  if (!check.ok) throw new Error('QUALITY_FAILED');
  const problems = qaProblems(plan, context, quality, root);
  const deviceQAValidated = plan.deviceQA?.status === 'PASS' && !problems.some(p => p.startsWith('Relevante echte Geräteabnahme'));
  const body = { schemaVersion: 1, context, plan, quality: q, deviceQAValidated, recommendation: problems.length ? 'BLOCKED' : 'READY', problems };
  return { ...body, digest: digest(body) };
}
export function validateCandidate(candidate, context, root) {
  const { digest: expected, ...body } = candidate;
  if (!expected || digest(body) !== expected || candidate.recommendation !== 'READY') throw new Error('CANDIDATE_NOT_READY_OR_CHANGED');
  if (digest(candidate.context) !== digest(context)) throw new Error('CANDIDATE_SOURCE_TARGET_PRODUCTION_OR_ENV_CHANGED');
  const fresh = createCandidate({ context, plan: candidate.plan, qualityFile: candidate.quality.path, root });
  if (fresh.digest !== expected || fresh.recommendation !== 'READY') throw new Error('CANDIDATE_EVIDENCE_CHANGED');
  return candidate;
}
export function validateHumanApproval(approval, candidate) {
  if (approval?.schemaVersion !== 1 || approval.kind !== 'human-production-approval' || approval.decision !== 'PUBLISH_PRODUCTION_ONCE'
    || approval.scope !== 'production-ota-only' || approval.candidateDigest !== candidate.digest
    || approval.commit !== candidate.context.source.commit || approval.platform !== candidate.context.target.platform || approval.runtime !== candidate.context.target.runtime
    || typeof approval.humanMessageReference !== 'string' || !approval.humanMessageReference.trim()
    || typeof approval.explicitStatement !== 'string' || !approval.explicitStatement.trim() || !Number.isFinite(Date.parse(approval.approvedAt))) throw new Error('EXPLICIT_HUMAN_APPROVAL_MISSING_OR_DIFFERENT_CANDIDATE');
  // Local trace attestation, not authenticated human identity. Operator must inspect
  // the actual human message; --confirm or an agent message is never that consent.
}
export function claimAttempt(commonDir, candidate) {
  const dir = join(commonDir, 'anyvo-ota-attempts');mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, candidate.digest + '.json');
  let fd;
  try { fd = openSync(path, 'wx', 0o600); }
  catch { throw new Error('CANDIDATE_ALREADY_ATTEMPTED_OR_LEDGER_UNAVAILABLE'); }
  closeSync(fd);
  const initial = { status: 'UNCONFIRMED', candidateDigest: candidate.digest, source: candidate.context.source,
    target: candidate.context.target, startedAt: new Date().toISOString(), note: 'Attempt claimed. No automatic retry, rollback or stale-ledger deletion.' };
  writeFileSync(path, JSON.stringify(initial, null, 2) + '\n', { mode: 0o600 });
  return { path, finish(result) { writeFileSync(path, JSON.stringify({ ...initial, ...result }, null, 2) + '\n', { mode: 0o600 }); } };
}
export function formatApprovalReport(c) {
  const x = c.context;
  return ['ANYVO OTA – Bereit zur Freigabe', '', `Freigabeempfehlung: ${c.recommendation}`, `Kandidat: ${c.digest}`,
    `Plattform: ${x.target.platform}`, `Version / Runtime: ${x.target.appVersion} / ${x.target.runtime}`, `Release-Commit: ${x.source.commit}`,
    `Channel / Environment: ${x.target.channel} / ${x.target.environment}`, `Risiko: ${x.risk.level} (${x.risk.areas.join(', ') || 'UI'})`,
    `Native Kompatibilitätsbasis: ${x.native.buildId}`,
    'Änderungen:', ...c.plan.changes.map(v => '- ' + v.description),
    'Mögliche Regressionen:', ...c.plan.regressions.map(v => '- ' + v),
    'Testauswahl: ' + c.plan.testRationale,
    'Testergebnisse: Typecheck, ESLint, Jest, Prozess-Regressionstests, Diff und unabhängiger Review hashgebunden am exakten Commit.',
    `Geräte-QA: ${c.deviceQAValidated ? 'PASS, siehe gebundenen physischen Gerätenachweis' : 'Kein physischer Nachweis; bei hohem Risiko blockiert'}`,
    `Production-Basis: ${x.production.baseline.group ?? x.production.baseline.buildId} / ${x.production.baseline.gitCommitHash}`,
    ...c.problems.map(p => 'BLOCKER: ' + p),
    'Freigabe umfasst ausschließlich eine Production-OTA dieses Kandidaten. Commit, Push, Merge, Build, Store und DB sind nicht enthalten.',
    'Keine zusätzliche Freigabefrage für denselben unveränderten Kandidaten. Externe Tool-/Plattformablehnungen bleiben STOP.',
  ].join('\n') + '\n';
}
