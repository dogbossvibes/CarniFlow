import { QaPipelineDiagnostics, assertPipelineDiagnostics, PIPELINE_LIMIT } from '../qaPipelineDiagnostics';
import type { ShortLegDiagnostics } from '../shortLegCornerDetection';
const row = (overrides = {}) => ({ apexIndex: 2, t: 1500, legBeforeM: 3, legAfterM: null, sampleCountBefore: 3, sampleCountAfter: 0, headingDeltaDeg: null, interiorAngleDeg: null, accuracyM: 5, confidence: 0, spreadBeforeDeg: 2, spreadAfterDeg: null, motionSupported: false, rejectReason: 'no_window_after', ...overrides }) as ShortLegDiagnostics;
it('retains live decisions from different sections without conflating identical apex indexes', () => {
 const q = new QaPipelineDiagnostics(); q.reset(1000);
 q.observe([row()], new Set(), 0, 1700);
 q.observe([row({ t: 2100, rejectReason: null, confidence: .8 })], new Set([2]), 1, 2300);
 const s=q.snapshot(); expect(s.decisions).toHaveLength(2); expect(s.decisions[0].reason).toBe('no_window_after'); expect(s.decisions[1].acceptedCandidate).toBe(true);
 expect(s.decisions.map(r=>r.tMs)).toEqual([500,1100]); assertPipelineDiagnostics(s);
 q.reset(3000); expect(q.snapshot().decisions).toHaveLength(0);
});
it('records paused arrivals, measurement delay and explicit bounded retention without coordinates', () => {
 const q=new QaPipelineDiagnostics();q.reset(1000);
 for(let i=0;i<PIPELINE_LIMIT+3;i++) q.fix(1000+i,1010+i,1,5,'paused',null);
 const s=q.snapshot();expect(s.observedFixes).toBe(PIPELINE_LIMIT+3);expect(s.omittedFixes).toBe(3);expect(s.fixes[0]).toMatchObject({measurementMs:3,receivedMs:13,outcome:'paused'});assertPipelineDiagnostics(s);
 expect(JSON.stringify(s)).not.toMatch(/latitude|longitude/);
 expect(()=>assertPipelineDiagnostics({...s,extra:'private'} as any)).toThrow();
 expect(()=>assertPipelineDiagnostics({...s,fixes:[{...s.fixes[0],measurementMs:Date.now()}],observedFixes:1,omittedFixes:0})).toThrow();
});
it('bounds decision rows, reports evictions, and updates rather than duplicates a retained apex', () => {
 const q=new QaPipelineDiagnostics();q.reset(1000);
 for(let i=0;i<PIPELINE_LIMIT+1;i++)q.observe([row({apexIndex:i})],new Set(),0,1700);
 q.observe([row({apexIndex:PIPELINE_LIMIT,rejectReason:null})],new Set([PIPELINE_LIMIT]),0,1800);
 const s=q.snapshot();expect(s.decisions).toHaveLength(PIPELINE_LIMIT);expect(s.evictedDecisionRows).toBe(1);expect(s.decisions.at(-1)?.acceptedCandidate).toBe(true);assertPipelineDiagnostics(s);
});
