import { getLocalDb } from '@/lib/localDb/client';
import { parsePlan, PLAN_LIMITS, PlanError, type StoredPlan, type TrackPlan } from './model';
export interface PlannerTx {
 getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
 getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
 runAsync(sql: string, ...params: (string | number)[]): Promise<{ changes: number }>;
}
export interface PlannerDeps { scope(): { userId: string | null; epoch: number }; transaction<T>(fn: (tx: PlannerTx) => Promise<T>): Promise<T> }
export function createPlannerRepository(ownerId: string, deps: PlannerDeps) {
 const initial = deps.scope();
 const check = () => { const s = deps.scope(); if (!ownerId || initial.userId !== ownerId || s.userId !== ownerId || s.epoch !== initial.epoch) throw new PlanError('ACCOUNT_CHANGED'); };
 const revision = (n: number) => { if (!Number.isSafeInteger(n) || n < 0) throw new PlanError('INVALID'); };
 return {
  async list(): Promise<StoredPlan[]> {
   check(); return deps.transaction(async tx => {
    check(); const rows = await tx.getAllAsync<{ id: string; revision: number; payload_json: string }>('select id,revision,payload_json from local_track_plans where owner_id=? order by updated_at desc,id', ownerId); check();
    return rows.map(row => { const plan = parsePlan(JSON.parse(row.payload_json)); if (plan.id !== row.id || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new PlanError('INVALID'); return { plan, revision: row.revision }; });
   });
  },
  async save(value: TrackPlan, expected: number): Promise<StoredPlan> {
   const plan = parsePlan(value); revision(expected); check();
   return deps.transaction(async tx => {
    check();
    if (!expected) {
     const count = await tx.getFirstAsync<{ n: number }>('select count(*) as n from local_track_plans where owner_id=?', ownerId); check();
     if (!count || count.n >= PLAN_LIMITS.plans) throw new PlanError('LIMIT');
     await tx.runAsync('insert into local_track_plans(owner_id,id,revision,updated_at,payload_json) values(?,?,?,?,?)', ownerId, plan.id, 1, Date.now(), JSON.stringify(plan));
    } else {
     const result = await tx.runAsync('update local_track_plans set revision=?,updated_at=?,payload_json=? where owner_id=? and id=? and revision=?', expected + 1, Date.now(), JSON.stringify(plan), ownerId, plan.id, expected);
     if (result.changes !== 1) throw new PlanError('CONFLICT');
    }
    check(); return { plan, revision: expected + 1 };
   });
  },
  async remove(id: string, expected: number) {
   revision(expected); check();
   return deps.transaction(async tx => {
    check(); const result = await tx.runAsync('delete from local_track_plans where owner_id=? and id=? and revision=?', ownerId, id, expected);
    if (result.changes !== 1) throw new PlanError('CONFLICT'); check();
   });
  },
 };
}
export function plannerRepository(ownerId: string, scope: PlannerDeps['scope']) {
 return createPlannerRepository(ownerId, { scope, async transaction<T>(fn: (tx: PlannerTx) => Promise<T>) {
  const db = await getLocalDb(); let value!: T;
  await db.withExclusiveTransactionAsync(async tx => { value = await fn(tx); }); return value;
 } });
}
