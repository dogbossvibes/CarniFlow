// Shared, fail-closed release policy. No publish/build calls in this module.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectReleaseContent } from './check-release-content.mjs';
import { validateQualityEvidence } from './release-quality-evidence.mjs';

export const POLICY_REF = 'refs/anyvo/release-policy';
export const POLICY_PATH = 'docs/agent/release-policy.json';
export const DEVICE_CASES = Object.freeze(['layStart', 'layFinish', 'searchStart', 'searchFinish',
  'save', 'reopen', 'offlineSave', 'existingDataRetained', 'liveActivityEnd', 'otaReceived']);
export const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const name = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
const sha = value => /^[0-9a-f]{40}$/.test(value ?? '');
const hash = value => /^[0-9a-f]{64}$/.test(value ?? '');
function insist(value, message) { if (!value) throw new Error(message); }
function json(file) { return JSON.parse(readFileSync(file, 'utf8')); }

// Include ALL platforms and runtimes, not only the candidate's runtime. A new
// Build58 OTA must invalidate a previously reviewed Build59 candidate as well.
export function liveFingerprint(channel, list) {
  insist(channel && typeof channel === 'object' && !Array.isArray(channel), 'Channel-Antwort ungültig.');
  insist(Array.isArray(list?.currentPage), 'OTA-Liste nicht vollständig lesbar.');
  const groups = list.currentPage.map(group => {
    insist(nonempty(group.group) && nonempty(group.runtimeVersion) && nonempty(group.platforms), 'OTA-Gruppenidentität fehlt.');
    return { group: group.group, runtime: group.runtimeVersion, platforms: group.platforms,
      gitCommitHash: group.gitCommitHash ?? null, createdAt: group.createdAt ?? null };
  });
  return digest(JSON.stringify(canonical({ channel, groups })));
}

export function validateDeviceReceipt(receipt, { plan, policyCommit }, readArtifact) {
  insist(receipt?.schemaVersion === 1 && receipt.status === 'PASS', 'Geräteabnahme fehlt oder nicht PASS.');
  insist(receipt.policyCommit === policyCommit && receipt.sourceCommit === plan.sourceCommit,
    'Geräteabnahme gehört zu einem älteren Soll-/Quellstand.');
  for (const field of ['platform', 'runtime', 'buildId', 'appVersion', 'buildNumber', 'nativeFingerprint', 'updateId']) {
    insist(nonempty(plan[field]) && receipt[field] === plan[field], `Gerätebindung fehlt/abweichend: ${field}`);
  }
  insist(receipt.physicalDevice === true && nonempty(receipt.deviceModel) && nonempty(receipt.osVersion)
    && nonempty(receipt.tester) && Number.isFinite(Date.parse(receipt.testedAt)), 'Echte Geräteprüfung nicht belegt.');
  insist(Array.isArray(receipt.openBlockers) && receipt.openBlockers.length === 0, 'Offene Gerätebefunde blockieren.');
  for (const key of DEVICE_CASES) {
    const check = receipt.checks?.[key];
    insist(check?.status === 'PASS' && nonempty(check.evidence?.path) && hash(check.evidence?.sha256), `Gerätefall fehlt: ${key}`);
    insist(digest(readArtifact(check.evidence.path)) === check.evidence.sha256, `Gerätebeleg verändert: ${key}`);
  }
  insist(receipt.otaSource === 'OTA' && receipt.emergencyFallback === false && plan.updateId !== 'embedded',
    'Embedded/Notfallstart ist kein OTA-Empfangsnachweis.');
}

export function validatePolicyBinding({ policy, policyCommit, plan, operation, live }) {
  insist(policy?.schemaVersion === 1 && policy.complete === true && sha(policyCommit), 'Vollständige unabhängige Release-Policy fehlt.');
  insist(nonempty(policy.preparedBy) && nonempty(policy.approvedBy)
    && policy.preparedBy.trim().toLowerCase() !== policy.approvedBy.trim().toLowerCase(), 'Unabhängige Policy-Abnahme fehlt.');
  insist(plan?.schemaVersion === 1 && plan.operation === operation && plan.policyCommit === policyCommit,
    'Plan fehlt oder ist nach neuer Soll-Festlegung veraltet.');
  insist(sha(plan.sourceCommit) && ['ios', 'android'].includes(plan.platform) && nonempty(plan.runtime), 'Kandidatenziel fehlt.');
  insist(['build', 'update', 'production-ota', 'submit', 'customer-check'].includes(operation), 'Unbekannter Releaseweg.');
  insist(same(plan.inventory, policy.inventory), 'Plan verwendet nicht die aktuelle unabhängige Soll-Inventur.');
  insist(Array.isArray(policy.live) && policy.live.length > 0
    && policy.live.some(entry => entry.channel === 'production' && entry.branch === 'production'), 'Production-Abgleich fehlt.');
  insist(new Set(policy.live.map(entry => entry.channel)).size === policy.live.length, 'Doppelte Live-Ziele.');
  insist(Array.isArray(live) && live.length === policy.live.length, 'Frischer Live-Abgleich fehlt.');
  for (const entry of policy.live) {
    insist(name(entry.channel) && name(entry.branch) && hash(entry.fingerprint), 'Live-Soll ungültig.');
    const current = live.find(item => item.channel === entry.channel && item.branch === entry.branch);
    insist(current?.fingerprint === entry.fingerprint, 'Neuere/geänderte OTA oder Channel-Zuordnung: Soll-Inventur und Kandidat erneut abgleichen.');
  }
  insist(Array.isArray(policy.openBlockers), 'Befundstatus fehlt.');
  if (['production-ota', 'customer-check'].includes(operation)) {
    insist(policy.openBlockers.length === 0, 'Offene Releasebefunde blockieren die Kundenauslieferung.');
  }
}

const command = (name, args, cwd, env = process.env) => execFileSync(name, args, {
  cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
});
function profileConfig(eas, name, seen = new Set()) {
  insist(nonempty(name) && !seen.has(name) && eas.build?.[name], 'Buildprofil fehlt/zyklisch.');
  seen.add(name);
  const current = eas.build[name];
  const parent = current.extends ? profileConfig(eas, current.extends, seen) : {};
  return { ...parent, ...current, env: { ...parent.env, ...current.env } };
}

export function requireReleaseGate(operation, { repositoryRoot = process.cwd(), platform, runtime } = {}) {
  const git = args => command('git', args, repositoryRoot).trim();
  // No --skip, no development mode, no caller-supplied alternate policy ref.
  insist(nonempty(process.env.ANYVO_RELEASE_PLAN), 'ANYVO_RELEASE_PLAN fehlt; kein Build/OTA/Submit.');
  const planFile = resolve(repositoryRoot, process.env.ANYVO_RELEASE_PLAN);
  const plan = json(planFile);
  const policyCommit = git(['rev-parse', '--verify', `${POLICY_REF}^{commit}`]);
  const policy = JSON.parse(command('git', ['show', `${policyCommit}:${POLICY_PATH}`], repositoryRoot));
  insist(git(['rev-parse', 'HEAD']) === plan.sourceCommit && !git(['status', '--porcelain']), 'Quelle ist nicht der saubere freigegebene HEAD.');
  insist(!platform || platform === plan.platform, 'Plattform widerspricht Releaseplan.');
  insist(!runtime || runtime === plan.runtime, 'Runtime widerspricht Releaseplan.');
  // Validate all offline bindings before contacting EAS.
  validatePolicyBinding({ policy, policyCommit, plan, operation, live: policy.live });
  const content = inspectReleaseContent({ repositoryRoot, inventoryRef: policy.inventory,
    manifest: json(resolve(dirname(planFile), plan.manifest)), candidateCommit: plan.sourceCommit,
    platform: plan.platform, runtime: plan.runtime });
  insist(content.ok, `Inhaltsprüfung blockiert: ${content.problems.join('; ')}`);
  const quality = validateQualityEvidence({ receiptPath: resolve(dirname(planFile), plan.qualityEvidence),
    head: plan.sourceCommit, tree: git(['rev-parse', 'HEAD^{tree}']), platform: plan.platform,
    runtime: plan.runtime, repositoryRoot });
  insist(quality.ok, `Quality-/Reviewprüfung blockiert: ${quality.problems.join('; ')}`);
  if (['production-ota', 'customer-check'].includes(operation)) {
    const devicePath = resolve(dirname(planFile), plan.deviceEvidence);
    validateDeviceReceipt(json(devicePath), { plan, policyCommit }, file => readFileSync(resolve(dirname(devicePath), file)));
  }
  const eas = json(resolve(repositoryRoot, 'eas.json'));
  const profile = profileConfig(eas, plan.profile);
  insist(name(plan.channel) && name(plan.environment), 'Kanal/Environment fehlt.');
  insist(policy.live.some(entry => entry.channel === plan.channel), 'Zielkanal fehlt im unabhängigen Live-Abgleich.');
  insist(profile.environment === plan.environment && profile.channel === plan.channel, 'Profil/Environment/Kanal widerspricht Plan.');
  if (['production-ota', 'customer-check'].includes(operation)) {
    insist(plan.environment === 'production' && plan.channel === 'production' && profile.developmentClient !== true,
      'Kundenstand benötigt Production und echten Releaseclient.');
  }
  const expo = JSON.parse(command(resolve(repositoryRoot, 'node_modules/.bin/expo'), ['config', '--type', 'public', '--json'],
    repositoryRoot, { ...process.env, ...profile.env, EAS_BUILD_PROFILE: plan.profile, EAS_BUILD_PLATFORM: plan.platform }));
  const configRuntime = expo[plan.platform]?.runtimeVersion ?? expo.runtimeVersion;
  const resolvedRuntime = typeof configRuntime === 'string' ? configRuntime : configRuntime?.policy === 'appVersion' ? expo.version : null;
  insist(resolvedRuntime === plan.runtime && expo.extra?.eas?.projectId === policy.projectId, 'Aufgelöste Runtime/EAS-Projekt weicht ab.');
  if (['production-ota', 'customer-check'].includes(operation)) {
    insist(nonempty(plan.updateGroup) && sha(plan.nativeSourceCommit), 'Getestete OTA-/native Herkunft fehlt.');
    const native = JSON.parse(command('eas', ['build:view', plan.buildId, '--json'], repositoryRoot));
    insist(native.id === plan.buildId && native.status === 'FINISHED'
      && native.platform?.toLowerCase() === plan.platform && native.gitCommitHash === plan.nativeSourceCommit
      && (native.runtime?.version ?? native.runtimeVersion) === plan.runtime
      && native.appVersion === plan.appVersion && String(native.appBuildVersion) === plan.buildNumber,
    'Gerätetest gehört nicht zum angegebenen echten nativen Build.');
    git(['merge-base', '--is-ancestor', plan.nativeSourceCommit, plan.sourceCommit]);
    const view = JSON.parse(command('eas', ['update:view', plan.updateGroup, '--json'], repositoryRoot));
    const update = (Array.isArray(view) ? view : [view]).find(item => item.id === plan.updateId);
    insist(update?.platform === plan.platform && update.runtimeVersion === plan.runtime
      && update.gitCommitHash === plan.sourceCommit && update.group === plan.updateGroup,
    'Tatsächlich getestete OTA gehört nicht zum Kandidaten.');
  }
  const live = policy.live.map(entry => ({ channel: entry.channel, branch: entry.branch,
    fingerprint: liveFingerprint(JSON.parse(command('eas', ['channel:view', entry.channel, '--json', '--non-interactive'], repositoryRoot)),
      JSON.parse(command('eas', ['update:list', '--branch', entry.branch, '--limit', '50', '--json', '--non-interactive'], repositoryRoot))) }));
  validatePolicyBinding({ policy, policyCommit, plan, operation, live });
  insist(git(['rev-parse', '--verify', `${POLICY_REF}^{commit}`]) === policyCommit
    && git(['rev-parse', 'HEAD']) === plan.sourceCommit && !git(['status', '--porcelain']), 'Quelle/Policy während Prüfung verändert.');
  return { plan, policyCommit, policy, content };
}
