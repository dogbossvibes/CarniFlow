import { emptyPositionTiming, observePositionTiming } from '../positionTimingDiagnostics';
it.each([5000, 15000, 30000])('reports %sms gaps without inventing fixes', gap => {
 const first=observePositionTiming(emptyPositionTiming(),1000);
 const result=observePositionTiming(first,1000+gap);
 expect(result).toMatchObject({received:2,lastIntervalMs:gap,largestGapMs:gap});
 expect(first.received).toBe(1);
});
it('duplicates and late callbacks do not move the chronological reference backwards',()=>{
 let s=observePositionTiming(emptyPositionTiming(),2000);
 s=observePositionTiming(s,2000);s=observePositionTiming(s,1000);s=observePositionTiming(s,3000);
 expect(s).toMatchObject({received:4,duplicates:1,outOfOrder:1,lastIntervalMs:1000,lastTimestamp:3000});
});
it('missing and nonfinite timestamps remain unknown',()=>{
 let s=observePositionTiming(emptyPositionTiming(),undefined);s=observePositionTiming(s,NaN);
 expect(s).toMatchObject({received:2,lastTimestamp:null,lastIntervalMs:null,largestGapMs:0});
});
