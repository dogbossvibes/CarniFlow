#!/usr/bin/env node
// ANYVO Prüfzentrum: reproduzierbare lokale Verifikation eines Commits.
//   npm run verify:center -- --target <worktree> [--base <ref>] [--layers code,db,app]
//        [--db-suite <name>] [--platform ios|android --runtime <rv>] [--out <dir>]
//        [--keep-db] [--start-docker] [--app-web-export]
// Berührt weder Staging noch Production, veröffentlicht nichts, committet nichts.
// Exit: 0 = alle gewählten Ebenen PASS/SKIP, 1 = mindestens eine FAIL, 2 = Werkzeugfehler.
import { realpathSync, mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { git, writeFile, log } from './verify-center/lib.mjs';
import { runCodeLayer, buildQualityReceipt, exportSnapshot } from './verify-center/code-layer.mjs';
import { runDbLayer } from './verify-center/db-layer.mjs';
import { runAppLayer } from './verify-center/app-layer.mjs';
import { SUITES } from './verify-center/db-plan.mjs';
import { renderReport } from './verify-center/report.mjs';

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const flags = { layers: 'code,db,app', dbSuite: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} braucht einen Wert`); return v; };
    switch (a) {
      case '--target': flags.target = next(); break;
      case '--base': flags.base = next(); break;
      case '--layers': flags.layers = next(); break;
      case '--db-suite': flags.dbSuite.push(next()); break;
      case '--platform': flags.platform = next(); break;
      case '--runtime': flags.runtime = next(); break;
      case '--out': flags.out = next(); break;
      case '--keep-db': flags.keepDb = true; break;
      case '--start-docker': flags.startDocker = true; break;
      case '--app-web-export': flags.appWebExport = true; break;
      case '--keep-work': flags.keepWork = true; break;
      case '-h': case '--help': flags.help = true; break;
      default: throw new Error(`Unbekanntes Argument ${a}`);
    }
  }
  flags.layers = flags.layers.split(',').map(s => s.trim()).filter(Boolean);
  for (const l of flags.layers) if (!['code', 'db', 'app'].includes(l)) throw new Error(`Unbekannte Ebene ${l}`);
  for (const s of flags.dbSuite) if (!SUITES[s]) throw new Error(`Unbekannte DB-Suite ${s} (bekannt: ${Object.keys(SUITES).join(', ')})`);
  if (flags.platform && !['ios', 'android'].includes(flags.platform)) throw new Error('--platform ios|android');
  return flags;
}

function defaultBase(target) {
  for (const ref of ['origin/main', 'main']) {
    try { return git(target, 'merge-base', 'HEAD', ref); } catch { /* nächster */ }
  }
  throw new Error('Basis nicht ermittelbar – --base angeben.');
}

function slug(s) { return s.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60); }

async function main() {
  let flags;
  try { flags = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`✗ ${e.message}`); process.exit(2); }
  if (flags.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 7).join('\n').replace(/^\/\/ ?/gm, ''));
    return 0;
  }
  const target = realpathSync(resolve(flags.target ?? process.cwd()));
  const head = git(target, 'rev-parse', 'HEAD');
  const tree = git(target, 'rev-parse', 'HEAD^{tree}');
  const branch = git(target, 'rev-parse', '--abbrev-ref', 'HEAD');
  const base = flags.base ? git(target, 'rev-parse', `${flags.base}^{commit}`) : defaultBase(target);
  try { git(target, 'merge-base', '--is-ancestor', base, head); } catch { console.error(`✗ Basis ${base} ist kein Vorfahre von HEAD.`); return 2; }
  const dirty = git(target, 'status', '--porcelain', '--untracked-files=no');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const out = resolve(flags.out ?? join(homedir(), 'canisflow-verify-reports', `${stamp}-${slug(branch)}-${head.slice(0, 8)}`));
  const relOut = relative(target, out);
  if (!relOut.startsWith('..') && !isAbsolute(relOut)) { console.error('✗ --out muss ausserhalb des Ziel-Repositories liegen (Beleg-Regel).'); return 2; }
  mkdirSync(out, { recursive: true });
  const work = realpathSync(mkdtempSync(join(tmpdir(), 'anyvo-verify-work-')));

  const meta = { tool: 'ANYVO verify-center', toolCommit: safeGit(TOOL_ROOT, 'rev-parse', 'HEAD'), target, branch, head, tree, base,
    dirty: dirty ? dirty.split('\n') : [], layers: flags.layers, startedAt: new Date().toISOString(), out };
  log(`Ziel ${branch} @ ${head.slice(0, 8)} (Basis ${base.slice(0, 8)}) → ${out}`);
  const results = {};
  let headDir = null;
  let baseDir = null;
  try {
    if (flags.layers.includes('code')) {
      results.code = await runCodeLayer({ target, head, base, work, out,
        nodeModulesCandidates: [target, TOOL_ROOT, ...worktreeCandidates(target)] });
      headDir = results.code.headDir ?? null;
      baseDir = results.code.baseDir ?? null;
      const c = results.code.checks ?? {};
      if (['typecheck', 'eslint', 'tests', 'diff'].every(k => c[k]?.evidence)) {
        const receipt = buildQualityReceipt({ out, head, tree, platform: flags.platform, runtime: flags.runtime, code: results.code,
          producer: `verify-center@${(meta.toolCommit ?? 'unknown').slice(0, 12)}` });
        writeFile(join(out, 'quality-evidence.json'), JSON.stringify(receipt, null, 2) + '\n');
        results.code.receipt = await validateReceipt(target, out, head, tree, flags);
      }
    }
    if (!headDir && (flags.layers.includes('db') || flags.layers.includes('app'))) {
      headDir = exportSnapshot(target, head, join(work, 'head'), null).dir;
    }
    if (flags.layers.includes('db')) {
      results.db = await runDbLayer({ targetDir: headDir, toolDir: TOOL_ROOT, out, suites: flags.dbSuite, keepDb: flags.keepDb, startDocker: flags.startDocker });
    }
    if (flags.layers.includes('app')) {
      results.app = await runAppLayer({ headDir: existsSync(join(headDir, 'node_modules')) ? headDir : null,
        baseDir: baseDir && existsSync(join(baseDir, 'node_modules')) ? baseDir : null, out, webExport: flags.appWebExport });
    }
  } catch (e) {
    results.error = String(e?.stack ?? e);
  } finally {
    if (!flags.keepWork) rmSync(work, { recursive: true, force: true });
  }
  meta.finishedAt = new Date().toISOString();
  for (const r of Object.values(results)) if (r && typeof r === 'object') { delete r.headDir; delete r.baseDir; }
  const report = { meta, results };
  writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const md = renderReport(report);
  writeFile(join(out, 'REPORT.md'), md);
  console.log(md);
  console.log(`\nBericht: ${join(out, 'REPORT.md')}`);
  if (results.error) { console.error(results.error); return 2; }
  return Object.values(results).some(r => r?.verdict === 'FAIL') ? 1 : 0;
}

function safeGit(repo, ...args) { try { return git(repo, ...args); } catch { return null; } }

function worktreeCandidates(target) {
  const list = safeGit(target, 'worktree', 'list', '--porcelain') ?? '';
  return list.split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9));
}

async function validateReceipt(target, out, head, tree, flags) {
  const own = join(TOOL_ROOT, 'scripts', 'release-quality-evidence.mjs');
  const theirs = join(target, 'scripts', 'release-quality-evidence.mjs');
  const validatorPath = existsSync(theirs) ? theirs : own;
  try {
    const { validateQualityEvidence } = await import(pathToFileURL(validatorPath).href);
    const v = validateQualityEvidence({ receiptPath: join(out, 'quality-evidence.json'), head, tree,
      platform: flags.platform, runtime: flags.runtime, repositoryRoot: target });
    return { validator: relative(target, validatorPath).startsWith('..') ? validatorPath : relative(target, validatorPath), ...v };
  } catch (e) {
    return { ok: false, problems: [`Validator nicht ausführbar: ${e.message}`] };
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().then(code => process.exit(code ?? 0), e => { console.error(e); process.exit(2); });
}
