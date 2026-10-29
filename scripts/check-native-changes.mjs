#!/usr/bin/env node
// Read-only native-change gate: 0 = JS-only, 1 = native change, 2 = unknown/error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function classifyNativePath(path) {
  if (/^modules\/[^/]+\/ios\//.test(path) || /^ios\//.test(path) || /Info\.plist$|\.entitlements$|Podfile(\.lock)?$|\.xcassets\//.test(path)) return 'ios';
  if (/^modules\/[^/]+\/android\//.test(path) || /^android\//.test(path) || /AndroidManifest\.xml$|\.gradle(\.kts)?$|gradle\.properties$|gradle-wrapper/.test(path)) return 'android';
  if (/^modules\/|^plugins\/|^patches\/|^scripts\/patch[-_]/.test(path)
    || /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|eas\.json|expo-module\.config\.json)$/.test(path)
    || /(^|\/)app\.(json|config\.(js|ts|mjs|cjs))$/.test(path)
    || /^react-native\.config\.(js|ts|mjs|cjs)$/.test(path)) return 'both';
  return null;
}
const nativeLifecycle = /^(?:preinstall|install|postinstall|preprepare|prepare|postprepare|prepublish|prepublishOnly|prepack|postpack|eas-build-.+)$/;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function nativeHooks(pkg) {
  const scripts = pkg.scripts ?? {};
  if (typeof scripts !== 'object' || Array.isArray(scripts)) throw new Error('Ungültige Package-Skripte.');
  const hooks = Object.create(null);
  const active = new Set();
  const visit = name => {
    if (active.has(name)) throw new Error('Zyklischer Buildhook-Alias.');
    if (Object.hasOwn(hooks, name)) return;
    if (!Object.hasOwn(scripts, name) || typeof scripts[name] !== 'string') throw new Error('Buildhook-Alias fehlt oder ist unklar.');
    if (/[$`]/.test(scripts[name])) throw new Error('Dynamischer Buildhook nicht statisch bestimmbar.');
    active.add(name);hooks[name] = scripts[name];
    // Resolve only named local package scripts, never execute or evaluate shell text.
    // Unsupported manager flags/subcommands and dynamic names are UNKNOWN.
    // Deliberately bounded grammar. Do not silently treat an unrecognized
    // executable (quoted commands, bun, wrappers, shell functions) as JS-only.
    const commands = scripts[name].split(/&&|\|\||;/);
    for (const command of commands) {
      if (!command.trim() || /[&|<>\\\n\r()]/.test(command)) throw new Error('Buildhook-Syntax nicht unterstützt.');
      const [, manager, args = ''] = /^\s*(\S+)(?:\s+(.*))?$/.exec(command.trim()) ?? [];
      if (!['node', 'echo', 'npm', 'pnpm', 'yarn'].includes(manager)) throw new Error('Buildhook-Befehl nicht unterstützt.');
      if (manager === 'node' || manager === 'echo') {
        if (manager === 'node' && (!args || args.startsWith('-'))) throw new Error('Node-Buildhook nicht statisch bestimmbar.');
        continue;
      }
      const tokens = args.trim().split(/\s+/);
      if (['run', 'run-script'].includes(tokens[0])) tokens.shift();
      else if (manager === 'npm') throw new Error('Unklarer npm-Buildhook.');
      while (['--silent', '--if-present'].includes(tokens[0])) tokens.shift();
      const raw = tokens[0] ?? '';
      const alias = /^(['"])(.*)\1$/.exec(raw)?.[2] ?? raw;
      if (!/^[A-Za-z0-9_:./@-]+$/.test(alias) || alias.startsWith('-')) throw new Error('Dynamischer Buildhook-Alias.');
      visit(alias);
    }
    // npm run also executes existing pre/post scripts for the named alias.
    for (const implicit of ['pre' + name, 'post' + name]) if (Object.hasOwn(scripts, implicit)) visit(implicit);
    active.delete(name);
  };
  for (const name of Object.keys(scripts).filter(name => nativeLifecycle.test(name))) visit(name);
  return hooks;
}
function nativePackageContract(pkg) {
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('Ungültiger Packagevertrag.');
  const keys = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides', 'resolutions',
    'expo', 'codegenConfig', 'react-native', 'rnpm', 'reactNativePermissions', 'workspaces', 'packageManager', 'installConfig'];
  return JSON.stringify(canonical({ fields: Object.fromEntries(keys.map(key => [key, pkg[key] ?? null])), hooks: nativeHooks(pkg) }));
}
export function inspectNativeChanges({ base, cwd = process.cwd(), runGit, readPackage } = {}) {
  if (typeof base !== 'string' || !base.trim() || base.startsWith('-') || /[\u0000-\u001f]/.test(base)) throw new Error('Eine explizite gültige Basis ist erforderlich.');
  const git = runGit ?? (args => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  }));
  if (git(['rev-parse', '--is-inside-work-tree']).trim() !== 'true') throw new Error('Kein Git-Worktree.');
  const baseCommit = git(['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).trim();
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  if (![baseCommit, head].every(value => /^[0-9a-f]{40}$/.test(value))) throw new Error('Git-Basis oder HEAD nicht bestimmbar.');
  const paths = [...new Set([
    ...git(['diff', '--name-only', '--no-renames', '-z', baseCommit, head, '--']).split('\0'),
    ...git(['diff', '--name-only', '--no-renames', '-z', '--']).split('\0'),
    ...git(['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD', '--']).split('\0'),
    ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean))];
  const hits = paths.flatMap(path => {
    const platform = classifyNativePath(path);
    return platform ? [{ path, platform }] : [];
  });
  // Every layer must be compared: an index/working revert must never conceal HEAD.
  const oldPackage = JSON.parse(git(['show', baseCommit + ':package.json']));
  const headPackage = JSON.parse(git(['show', head + ':package.json']));
  const indexPackage = JSON.parse(git(['show', ':package.json']));
  const current = JSON.parse(readPackage ? readPackage() : readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  const contracts = [oldPackage, headPackage, indexPackage, current].map(nativePackageContract);
  if (contracts.some(contract => contract !== contracts[0])) hits.push({ path: 'package.json', platform: 'both' });
  // A stable hook command can still invoke a changed local build script.
  const hooks = [oldPackage, headPackage, indexPackage, current].flatMap(pkg => Object.values(nativeHooks(pkg)));
  if (hooks.some(hook => typeof hook !== 'string')) throw new Error('Ungültiger Buildhook.');
  for (const path of paths) {
    if (!hits.some(hit => hit.path === path) && hooks.some(hook => hook.includes(path))) hits.push({ path, platform: 'both' });
  }
  return { schemaVersion: 1, baseCommit, head, changedFileCount: paths.length, requiresNativeBuild: hits.length > 0, hits };
}
export function main(args = process.argv.slice(2)) {
  try {
    if (args.length !== 1) throw new Error('Explizite Basis erforderlich.');
    const result = inspectNativeChanges({ base: args[0] });
    console.log(JSON.stringify(result, null, 2));
    return result.requiresNativeBuild ? 1 : 0;
  } catch {
    console.error('STOP: Native Kompatibilität nicht bestimmbar. Explizite Basis, Repository und Dateivergleich prüfen.');
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main();
