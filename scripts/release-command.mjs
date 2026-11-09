#!/usr/bin/env node
// Managed release entrypoints. --dry-run only checks; it never starts a build.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { hostname } from 'node:os';
import { requireReleaseGate } from './release-entry-gate.mjs';
import { acquireReleaseLock, lockPathFor } from './update-production.mjs';

export function releaseCommandArgs(operation, plan, args) {
  const values = {}, flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--dry-run', '--local'].includes(arg)) {
      if (flags.has(arg)) throw new Error('Doppelter Schalter.');
      flags.add(arg);
    } else {
      if (!['--platform', '--profile', '--channel', '--environment', '--message', '--id'].includes(arg)
        || Object.hasOwn(values, arg) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Unbekannter/doppelter Parameter.');
      values[arg] = args[++i];
    }
  }
  const expected = { '--platform': plan.platform, '--profile': plan.profile, '--channel': plan.channel,
    '--environment': plan.environment, '--message': plan.message, '--id': plan.buildId };
  for (const [key, value] of Object.entries(values)) if (expected[key] !== value) throw new Error(`Parameter widerspricht Plan: ${key}`);
  if (flags.has('--local') && operation !== 'build') throw new Error('--local ist nur für build erlaubt.');
  if (operation === 'build') return ['build', '--platform', plan.platform, '--profile', plan.profile,
    '--non-interactive', ...(flags.has('--local') ? ['--local'] : [])];
  if (operation === 'update') {
    if (!plan.message?.trim() || plan.channel === 'production') throw new Error('Production-OTA ausschließlich über update-production.mjs.');
    return ['update', '--platform', plan.platform, '--channel', plan.channel, '--environment', plan.environment,
      '--message', plan.message, '--non-interactive'];
  }
  if (operation === 'submit') {
    // Upload for internal testing only: customer release is a separate decision.
    if (plan.platform !== 'ios' || !/^[0-9a-f-]{36}$/.test(plan.buildId ?? '')) throw new Error('Nur expliziter iOS-TestFlight-Build-Upload; kein Android-Track-Release.');
    return ['submit', '--platform', 'ios', '--profile', plan.submitProfile ?? 'production', '--id', plan.buildId, '--non-interactive'];
  }
  if (operation === 'customer-check') return null;
  throw new Error('Unbekannter Releaseweg.');
}

export function main(args = process.argv.slice(2)) {
  const [operation, ...rest] = args;
  const { plan } = requireReleaseGate(operation);
  const command = releaseCommandArgs(operation, plan, rest);
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const lock = acquireReleaseLock(lockPathFor(resolve(common)), { pid: process.pid, host: hostname(),
    startedAt: new Date().toISOString(), head: plan.sourceCommit, platform: plan.platform, worktree: process.cwd() });
  if (!lock.ok) throw new Error('Anderer Build-/OTA-/Freigabevorgang hält den gemeinsamen Release-Lock.');
  try {
  if (operation === 'submit' || operation === 'customer-check') {
    const build = JSON.parse(execFileSync('eas', ['build:view', plan.buildId, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const nativeSource = plan.nativeSourceCommit ?? plan.sourceCommit;
    if (build.status !== 'FINISHED' || build.gitCommitHash !== nativeSource || build.platform?.toLowerCase() !== plan.platform
      || (build.runtime?.version ?? build.runtimeVersion) !== plan.runtime || build.appVersion !== plan.appVersion
      || String(build.appBuildVersion) !== plan.buildNumber) throw new Error('Hochzuladender/freizugebender Build stimmt nicht mit dem geprüften Kandidaten überein.');
    execFileSync('git', ['merge-base', '--is-ancestor', nativeSource, plan.sourceCommit], { stdio: 'pipe' });
  }
  // Read again immediately before a side effect, including all runtimes' live state.
  const rechecked = requireReleaseGate(operation);
  if (JSON.stringify(rechecked.plan) !== JSON.stringify(plan)) throw new Error('Releaseplan während Prüfung geändert.');
  if (!command || rest.includes('--dry-run')) {
    console.log('PASS: aktueller Inhalt und erforderliche Nachweise geprüft. Nichts gebaut/hochgeladen/veröffentlicht.');
    return;
  }
  execFileSync('eas', command, { stdio: 'inherit' });
  } finally { lock.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; }
}
