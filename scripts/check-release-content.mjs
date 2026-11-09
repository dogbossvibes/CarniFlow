#!/usr/bin/env node
// Read-only, offline content proof. This complements, never replaces, release guards.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');
const commit = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const path = value => text(value) && !value.startsWith('/') && !/[\\:\u0000-\u001f]/.test(value) && !value.split('/').some(p => !p || p === '.' || p === '..');
const identity = value => text(value) ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function requireThat(ok, message) { if (!ok) throw new Error(message); }
function unique(items) { return new Set(items).size === items.length; }
function readEvidence(ref, readBlob) {
  requireThat(commit(ref?.commit) && path(ref?.path) && hash(ref?.sha256), 'Ungültige versionierte Belegreferenz.');
  const bytes = readBlob(ref.commit, ref.path);
  requireThat(sha(bytes) === ref.sha256, 'Beleghash stimmt nicht.');
  return JSON.parse(bytes.toString());
}

export function validateReleaseContent({ inventoryRef, manifest, candidateCommit, platform, runtime, readBlob, readObjectId, isAncestor }) {
  const problems = [], covered = [], deferred = [];
  try {
    requireThat(commit(candidateCommit) && ['ios', 'android'].includes(platform) && text(runtime), 'Eindeutiges Kandidatenziel fehlt.');
    // inventoryRef comes from the coordinator, not from manifest or candidate discovery.
    const inventory = readEvidence(inventoryRef, readBlob);
    requireThat(inventory.schemaVersion === 1 && inventory.scope === 'ANYVO_SHARED_FEATURE_BASELINE', 'Soll-Schema unbekannt.');
    requireThat(inventory.complete === true && text(inventory.revision), 'Soll-Inventur fehlt, ist UNKNOWN oder unvollständig.');
    requireThat(identity(inventory.preparedBy) && identity(inventory.approvedBy) && identity(inventory.preparedBy) !== identity(inventory.approvedBy), 'Unabhängige Soll-Festlegung fehlt.');
    requireThat(Array.isArray(inventory.protectedBaselines) && inventory.protectedBaselines.length > 0
      && unique(inventory.protectedBaselines.map(p => p.id)), 'Unabhängig festgelegte Schutzbasis fehlt.');
    for (const baseline of inventory.protectedBaselines) {
      requireThat(text(baseline.id) && commit(baseline.sourceCommit) && Array.isArray(baseline.paths)
        && baseline.paths.length > 0 && unique(baseline.paths) && baseline.paths.every(path), 'Schutzbasis unvollständig.');
      for (const file of baseline.paths) {
        const expected = readObjectId(baseline.sourceCommit, file);
        requireThat(commit(expected) && expected === readObjectId(candidateCommit, file), `Geschützter Inhalt verändert: ${baseline.id}/${file}`);
      }
    }
    requireThat(Array.isArray(inventory.packages) && inventory.packages.length > 0 && unique(inventory.packages.map(p => p.id)), 'Soll-Paketmenge fehlt/ist doppelt.');
    for (const p of inventory.packages) {
      requireThat(text(p.id) && ['approved', 'released'].includes(p.state) && commit(p.sourceCommit), 'Ungültiges Soll-Paket.');
      requireThat(Array.isArray(p.platforms) && p.platforms.length > 0 && unique(p.platforms) && p.platforms.every(v => ['ios', 'android'].includes(v)), 'Plattformumfang fehlt.');
      requireThat(Array.isArray(p.sourceFiles) && p.sourceFiles.length > 0 && unique(p.sourceFiles) && p.sourceFiles.every(path), 'Quell-Dateiumfang fehlt.');
      requireThat(commit(p.taskReport?.commit) && path(p.taskReport?.path), 'Bestehender Taskbericht fehlt.');
      readBlob(p.taskReport.commit, p.taskReport.path);
      for (const f of p.sourceFiles) readBlob(p.sourceCommit, f);
    }
    requireThat(manifest?.schemaVersion === 1 && manifest.candidateCommit === candidateCommit && manifest.platform === platform && manifest.runtime === runtime, 'Manifest gehört nicht zum exakten Kandidaten/Ziel.');
    requireThat(exact(manifest.inventory, inventoryRef) && text(manifest.producer), 'Unabhängige Soll-Bindung oder Producer fehlt.');
    const intended = inventory.packages.filter(p => p.platforms.includes(platform));
    requireThat(intended.length > 0, 'Keine bestätigte Soll-Abdeckung für diese Plattform.');
    requireThat(Array.isArray(manifest.packages) && unique(manifest.packages.map(p => p.id)), 'Manifest-Pakete fehlen/sind doppelt.');
    requireThat(exact(manifest.packages.map(p => p.id).sort(), intended.map(p => p.id).sort()), 'Manifest deckt die gesamte festgelegte Soll-Menge nicht exakt ab.');
    for (const p of intended) {
      try {
        const proof = manifest.packages.find(item => item.id === p.id);
        if (proof.kind === 'ancestry') {
          requireThat(isAncestor(p.sourceCommit, candidateCommit), 'Quellcommit nicht enthalten.');
          // Ancestry alone cannot detect a later revert. Changed files need a reviewed port.
          for (const f of p.sourceFiles) requireThat(sha(readBlob(p.sourceCommit, f)) === sha(readBlob(candidateCommit, f)), 'Quellinhalt abweichend; geprüfter Port erforderlich.');
        } else {
          requireThat(['port', 'deferred'].includes(proof.kind), 'Unbekannter Übernahmenachweis.');
          const review = readEvidence(proof.review, readBlob);
          requireThat(review.schemaVersion === 1 && review.status === 'APPROVED' && review.kind === proof.kind
            && review.packageId === p.id && review.sourceCommit === p.sourceCommit && review.candidateCommit === candidateCommit
            && review.platform === platform && review.runtime === runtime, 'Review gehört nicht zum exakten Quell-/Zielpaket.');
          requireThat(identity(review.producer) === identity(manifest.producer) && identity(review.reviewer)
            && identity(review.reviewer) !== identity(review.producer), 'Unabhängiger Port-/Zurückstellungsreview fehlt.');
          if (proof.kind === 'port') {
            requireThat(Array.isArray(review.files) && exact(review.files.map(f => f.sourcePath).sort(), [...p.sourceFiles].sort())
              && unique(review.files.map(f => f.sourcePath)), 'Port deckt nicht alle Quelldateien ab.');
            for (const f of review.files) requireThat(path(f.targetPath) && hash(f.targetSha256)
              && sha(readBlob(candidateCommit, f.targetPath)) === f.targetSha256, 'Port-Zielinhalt stimmt nicht.');
          } else {
            requireThat(text(review.reason) && text(review.approvedBy), 'Ausdrücklich begründete Zurückstellung fehlt.');
            deferred.push({ id: p.id, reason: review.reason });
          }
        }
        covered.push(p.id);
      } catch (error) { problems.push(`${p.id}: ${error.message}`); }
    }
  } catch (error) { problems.push(error.message); }
  return { ok: problems.length === 0, status: problems.length ? 'BLOCKED' : deferred.length ? 'PASS_WITH_EXPLICIT_DEFERRALS' : 'PASS', candidateCommit, platform, runtime, covered, deferred, problems };
}

export function inspectReleaseContent({ repositoryRoot, inventoryRef, manifest, candidateCommit, platform, runtime }) {
  const git = args => execFileSync('git', args, { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
  try { requireThat(commit(candidateCommit), 'Ungültiger Kandidat.'); git(['cat-file', '-e', `${candidateCommit}^{commit}`]); }
  catch { return { ok: false, status: 'BLOCKED', problems: ['Kandidaten-Commit fehlt lokal.'] }; }
  return validateReleaseContent({ inventoryRef, manifest, candidateCommit, platform, runtime,
    readBlob: (ref, file) => {
      requireThat(commit(ref) && path(file), 'Ungültige Git-Referenz.');
      try { git(['cat-file', '-e', `${ref}^{commit}`]); return git(['show', `${ref}:${file}`]); }
      catch { throw new Error('Versionierter Quellinhalt/Beleg fehlt.'); }
    },
    readObjectId: (ref, file) => {
      requireThat(commit(ref) && path(file), 'Ungültige Schutzreferenz.');
      try { return git(['rev-parse', '--verify', `${ref}:${file}`]).toString().trim(); }
      catch { throw new Error('Geschützter Pfad fehlt.'); }
    },
    isAncestor: (base, target) => {
      try { git(['merge-base', '--is-ancestor', base, target]); return true; } catch { return false; }
    },
  });
}
export function runContentPreflight(args, repositoryRoot = process.cwd()) {
  if (args.length === 1 && args[0] === '--development-checks-only') {
    return { ok: true, releaseEligible: false, status: 'DEVELOPMENT_CHECKS_ONLY' };
  }
  try {
    const allowed = ['--inventory-commit', '--inventory-path', '--inventory-sha256', '--manifest', '--commit', '--platform', '--runtime'];
    requireThat(args.length === allowed.length * 2, 'Alle sieben eindeutigen Parameter sind erforderlich.');
    const options = {};
    for (let i = 0; i < args.length; i += 2) { requireThat(allowed.includes(args[i]) && !Object.hasOwn(options, args[i]), 'Unbekannter/doppelter Parameter.'); options[args[i]] = args[i + 1]; }
    const git = args => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    requireThat(git(['rev-parse', 'HEAD']) === options['--commit'] && !git(['status', '--porcelain']), 'Kandidat ist nicht der saubere aktuelle Arbeitsstand.');
    const result = inspectReleaseContent({ repositoryRoot, inventoryRef: { commit: options['--inventory-commit'], path: options['--inventory-path'], sha256: options['--inventory-sha256'] }, manifest: JSON.parse(readFileSync(resolve(repositoryRoot, options['--manifest']), 'utf8')), candidateCommit: options['--commit'], platform: options['--platform'], runtime: options['--runtime'] });
    return { ...result, releaseEligible: result.ok };
  } catch { return { ok: false, releaseEligible: false, status: 'BLOCKED', problems: ['Soll-Inventur, Manifest oder Parameter fehlen/sind ungültig.'] }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = runContentPreflight(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
}
