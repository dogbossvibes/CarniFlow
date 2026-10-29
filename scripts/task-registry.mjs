// Repository-wide task allocation. Only explicit allocation writes metadata.
import { openSync, closeSync, writeFileSync, fsyncSync, readFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const registryDirectory = commonDir => join(resolve(commonDir), 'anyvo-task-registry-v1');
const taskNumber = name => /^T-(\d+)\.json$/.exec(name)?.[1];
export function readTaskRegistry(commonDir) {
  const dir = registryDirectory(commonDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => taskNumber(name)).map(name => {
    const record = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    if (record.taskId !== name.slice(0, -5) || typeof record.owner !== 'string' || typeof record.worktree !== 'string') throw new Error('Taskregistry beschädigt; keine neue Vergabe.');
    return record;
  });
}
export function reserveTask({ commonDir, requestedId, existingIds = [], owner, purpose, branch, worktree, baseCommit }) {
  for (const value of [owner, purpose, branch, worktree]) if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) throw new Error('Owner, Zweck, Branch und Worktree sind Pflicht.');
  if (!/^[0-9a-f]{40}$/.test(baseCommit ?? '')) throw new Error('Aufgelöster Basis-Commit fehlt.');
  if (requestedId && !/^T-[1-9]\d*$/.test(requestedId)) throw new Error('Ungültige Task-ID.');
  const dir = registryDirectory(commonDir);
  mkdirSync(dir, { recursive: true });
  // Claim filenames, not partially written JSON from a concurrent allocator.
  // Incomplete historical claims stay occupied; they are never deleted/reused.
  const occupied = readdirSync(dir).filter(name => taskNumber(name)).map(name => name.slice(0, -5));
  const used = new Set([...existingIds, ...occupied]);
  if ([...used, ...(requestedId ? [requestedId] : [])].some(id => /^T-\d+$/.test(id) && (!Number.isSafeInteger(Number(id.slice(2))) || Number(id.slice(2)) < 1))) throw new Error('Task-ID außerhalb des sicheren Zahlenbereichs.');
  if (requestedId && used.has(requestedId)) throw new Error('Task-ID bereits belegt; kein Überschreiben.');
  let next = Math.max(60, ...[...used].filter(id => /^T-\d+$/.test(id)).map(id => Number(id.slice(2)))) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Task-ID-Bereich erschöpft.');
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const taskId = requestedId || `T-${next++}`;
    const record = { schemaVersion: 1, taskId, owner: owner.trim(), purpose: purpose.trim(), branch, worktree: resolve(worktree), baseCommit, status: 'reserved', reservationId: randomUUID(), createdAt: new Date().toISOString() };
    let fd;
    try { fd = openSync(join(dir, `${taskId}.json`), 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST' && !requestedId) continue; throw error; }
    try { writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`); fsyncSync(fd); }
    finally { closeSync(fd); }
    return record;
  }
  throw new Error('Task-ID konnte nicht atomar reserviert werden.');
}
export function finishReservation(commonDir, record, status) {
  if (!['created', 'creation_failed'].includes(status)) throw new Error('Ungültiger Reservierungsstatus.');
  const path = join(registryDirectory(commonDir), `${record.taskId}.json`);
  const current = JSON.parse(readFileSync(path, 'utf8'));
  if (current.reservationId !== record.reservationId || current.status !== 'reserved') throw new Error('Fremde oder bereits abgeschlossene Reservierung.');
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ ...current, status }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temp, path);
}
