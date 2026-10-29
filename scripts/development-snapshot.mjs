#!/usr/bin/env node
// Read-only Git inventory. Writes only a new, explicit external report directory.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, sep, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readTaskRegistry } from './task-registry.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const inside = (parent, path) => { const rel = relative(resolve(parent), resolve(path)); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)); };
export function parseWorktrees(text) {
  const nul = text.includes('\0');
  return text.trim().split(nul ? /\0\0+/ : /\n\n+/).filter(Boolean).map(block => Object.fromEntries(block.split(nul ? '\0' : '\n').filter(Boolean).map(line => {
    const space = line.indexOf(' ');return space < 0 ? [line, true] : [line.slice(0, space), line.slice(space + 1)];
  })));
}
export function matchingReportIdentity(entry, branch) {
  const dir = join(entry.worktree, 'docs/agent/tasks');
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir).filter(name => name.endsWith('.md') && name !== '_TEMPLATE.md')) {
    const path = join(dir, name);
    const text = readFileSync(path, 'utf8').replace(/\*\*|`/g, '');
    const field = label => {
      for (const line of text.split('\n')) {
        const match = new RegExp('^\\s*(?:[-*]\\s*)?' + label + '\\s*:\\s*(.+)$').exec(line)
          ?? new RegExp('^\\s*\\|\\s*' + label + '\\s*\\|\\s*([^|]+)\\|').exec(line);
        if (match) return match[1].trim();
      }
      return null;
    };
    const branchField = field('Branch');const worktreeField = field('Worktree');
    if (!branch || branchField !== branch || !worktreeField || resolve(entry.worktree, worktreeField) !== resolve(entry.worktree)) continue;
    const owner = field('(?:Primary Agent|Owner|Verantwortlich|Verantwortlicher Agent)');
    if (!owner || /<|unbekannt|unknown/i.test(owner)) continue;
    return { owner, purpose: text.split('\n').find(line => line.startsWith('# '))?.slice(2) ?? name,
      evidence: { path, sha256: hash(readFileSync(path)), qualification: 'declared in matching task report, not live owner confirmation' } };
  }
  return null;
}
export function worktreeRisk(entry, status) {
  if (status === null) return 'UNKNOWN';
  const rows = status.split('\0').filter(Boolean);
  if (rows.some(row => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(row.slice(0, 2)))) return 'CONFLICT';
  if (rows.some(row => !row.startsWith('??'))) return String(entry.branch ?? '').startsWith('refs/heads/release/') ? 'DIRTY_RELEASE' : 'DIRTY_TRACKED';
  return rows.length ? 'UNTRACKED_ONLY' : 'CLEAN';
}
export function collectDevelopmentSnapshot({ root, base, owners = [] }) {
  if (!root || !base || base.startsWith('-')) throw new Error('Root und explizite Basis erforderlich.');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  const commonDir = resolve(root, git('rev-parse', '--git-common-dir').trim());
  if (resolve(git('rev-parse', '--show-toplevel').trim()) !== resolve(root)) throw new Error('Root ist nicht das Git-Toplevel.');
  const baseCommit = git('rev-parse', '--verify', '--end-of-options', base + '^{commit}').trim();
  if (!/^[0-9a-f]{40}$/.test(baseCommit)) throw new Error('Basis unklar.');
  const tree = git('rev-parse', baseCommit + '^{tree}').trim();
  const beforeList = git('worktree', 'list', '--porcelain', '-z');
  const refsBefore = git('for-each-ref', '--format=%(refname) %(objectname)');
  const registry = readTaskRegistry(commonDir);
  const entries = parseWorktrees(beforeList).map(entry => {
    const branch = String(entry.branch ?? '').replace(/^refs\/heads\//, '');
    let status = null;
    try { status = execFileSync('git', ['-C', entry.worktree, 'status', '--porcelain=v1', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); } catch { /* retain unknown */ }
    const registered = registry.find(row => row.worktree === resolve(entry.worktree) && row.branch === branch);
    const supplied = owners.find(row => row.worktree === resolve(entry.worktree) && row.branch === branch && typeof row.owner === 'string' && typeof row.purpose === 'string' && row.evidence);
    const reported = registered || supplied ? null : matchingReportIdentity(entry, branch);
    const identity = registered ?? supplied ?? reported;
    return { path: entry.worktree, branch: branch || null, head: entry.HEAD, detached: !!entry.detached, locked: !!entry.locked, prunable: !!entry.prunable,
      riskClass: worktreeRisk(entry, status), statusSHA256: status === null ? null : hash(status),
      owner: identity?.owner ?? null, purpose: identity?.purpose ?? null,
      identityEvidence: registered ? 'repository task registry' : supplied?.evidence ?? reported?.evidence ?? null,
      purposeHintUnverified: identity ? null : branch,
      status: status === null ? null : status.split('\0').filter(Boolean) };
  });
  const canonicalWorkingDocuments = {};
  const documentContents = {};
  for (const name of ['AGENTS.md', 'docs/agent/README.md', 'docs/agent/ACTIVE_WORK.md', 'docs/agent/ANYVO_MASTER_STATUS.md']) {
    const path = join(root, name);
    if (existsSync(path)) {
      documentContents[name] = readFileSync(path, 'utf8');
      canonicalWorkingDocuments[name] = { sha256: hash(documentContents[name]), source: 'captured working document; not part of pinned base' };
    }
  }
  const afterList = git('worktree', 'list', '--porcelain', '-z');
  const refsAfter = git('for-each-ref', '--format=%(refname) %(objectname)');
  const classes = {};
  for (const row of entries) classes[row.riskClass] = (classes[row.riskClass] ?? 0) + 1;
  return { schemaVersion: 1, capturedAt: new Date().toISOString(), root: resolve(root), commonDir, baseCommit, tree,
    sourceTreeListing: git('ls-tree', '-r', '--full-tree', baseCommit),
    observation: { inventoryStableDuringRead: beforeList === afterList && refsBefore === refsAfter, canonicalDocumentsStableDuringRead: Object.keys(canonicalWorkingDocuments).every(name => hash(readFileSync(join(root, name))) === canonicalWorkingDocuments[name].sha256), worktreeListSHA256: hash(afterList), refsSHA256: hash(refsAfter) },
    canonicalWorkingDocuments, documentContents, summary: { count: entries.length, classes, ownerDocumented: entries.filter(row => row.owner).length, ownerUnknown: entries.filter(row => !row.owner).length }, entries };
}
function main(args) {
  const value = flag => args[args.indexOf(flag) + 1];
  try {
    for (const flag of ['--root', '--base', '--out']) if (args.filter(a => a === flag).length !== 1 || !value(flag) || value(flag).startsWith('--')) throw new Error();
    const owners = args.includes('--owners') ? JSON.parse(readFileSync(value('--owners'), 'utf8')) : [];
    if (!Array.isArray(owners)) throw new Error();
    const snapshot = collectDevelopmentSnapshot({ root: resolve(value('--root')), base: value('--base'), owners });
    const requestedOutput = resolve(value('--out'));
    const output = join(realpathSync(dirname(requestedOutput)), basename(requestedOutput));
    if (snapshot.entries.some(row => inside(existsSync(row.path) ? realpathSync(row.path) : row.path, output)) || inside(realpathSync(snapshot.commonDir), output)) throw new Error();
    mkdirSync(output, { recursive: false });
    const listing = snapshot.sourceTreeListing;delete snapshot.sourceTreeListing;
    const documents = snapshot.documentContents;delete snapshot.documentContents;
    for (const [name, text] of Object.entries(documents)) {
      const path = join(output, 'canonical-documents', name);
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, text, { flag: 'wx', mode: 0o600 });
    }
    writeFileSync(join(output, 'git-tree.txt'), listing, { flag: 'wx', mode: 0o600 });
    snapshot.sourceTreeListingSHA256 = hash(listing);
    writeFileSync(join(output, 'SNAPSHOT.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ baseCommit: snapshot.baseCommit, tree: snapshot.tree, ...snapshot.summary, inventoryStableDuringRead: snapshot.observation.inventoryStableDuringRead }));
    return snapshot.observation.inventoryStableDuringRead && snapshot.observation.canonicalDocumentsStableDuringRead ? 0 : 2;
  } catch {
    console.error('STOP: Snapshot nicht vollständig bestätigt; vorhandene Quellen und Berichte bleiben erhalten.');
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
