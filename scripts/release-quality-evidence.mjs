// Offline validation only. Existing live/native/runtime guards remain mandatory.
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';

export function validateQualityEvidence({ receiptPath, head, tree, platform, runtime, repositoryRoot }) {
  const problems = [];
  if (typeof receiptPath !== 'string' || !receiptPath.trim()) return { ok: false, problems: ['--quality-evidence fehlt.'] };
  try {
    const file = resolve(receiptPath);
    const outside = path => {
      const rel = relative(realpathSync(repositoryRoot), realpathSync(path));
      return isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep);
    };
    if (!outside(file)) throw new Error();
    if (!lstatSync(file).isFile() || lstatSync(file).size > 1024 * 1024) throw new Error();
    const receipt = JSON.parse(readFileSync(file, 'utf8'));
    if (receipt.schemaVersion !== 1) problems.push('Quality-Schema unbekannt.');
    if (!/^[0-9a-f]{40}$/.test(head ?? '') || !/^[0-9a-f]{40}$/.test(tree ?? '') || receipt.source?.commit !== head || receipt.source?.tree !== tree) problems.push('Quality-Nachweis gehört nicht exakt zu HEAD/Tree.');
    if (!['ios', 'android'].includes(platform) || !runtime || receipt.target?.platform !== platform || receipt.target?.runtime !== runtime) problems.push('Quality-Zielplattform/Runtime stimmt nicht.');
    const verifyArtifact = evidence => {
      if (!evidence || typeof evidence.path !== 'string' || !/^[0-9a-f]{64}$/.test(evidence.sha256 ?? '')) throw new Error();
      const path = resolve(dirname(file), evidence.path);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error();
      if (!outside(path)) throw new Error();
      if (createHash('sha256').update(readFileSync(path)).digest('hex') !== evidence.sha256) throw new Error();
    };
    for (const key of ['typecheck', 'eslint', 'tests', 'diff']) {
      const check = receipt.checks?.[key];
      if (check?.exitCode !== 0) problems.push(`Quality-Prüfung ${key} fehlt oder ist fehlgeschlagen.`);
      verifyArtifact(check?.evidence);
    }
    const lint = receipt.checks?.eslint;
    if (lint?.errors !== 0 || !Number.isInteger(lint?.warnings) || lint.warnings < 0) problems.push('ESLint-Ergebnis nicht vollständig.');
    const tests = receipt.checks?.tests;
    if (!Number.isInteger(tests?.passed) || tests.passed < 1 || tests.failed !== 0 || !Number.isInteger(tests?.skipped) || tests.skipped < 0) problems.push('Kein erfolgreicher aussagekräftiger Testnachweis.');
    const normalizeIdentity = value => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
    const producer = normalizeIdentity(receipt.producer);
    const reviewer = normalizeIdentity(receipt.review?.reviewer);
    if (!producer || !reviewer || producer === reviewer || receipt.review?.status !== 'PASS' || receipt.review?.sourceCommit !== head) problems.push('Unabhängiger Review am exakten Commit fehlt.');
    verifyArtifact(receipt.review?.evidence);
    return { ok: problems.length === 0, problems };
  } catch {
    return { ok: false, problems: [...problems, 'Quality-Datei oder hashgebundener Beleg fehlt/ist ungültig.'] };
  }
}
