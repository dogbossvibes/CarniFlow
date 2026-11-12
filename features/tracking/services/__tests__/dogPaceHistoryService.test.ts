import { getDogPaceHistory } from '../dogPaceHistoryService';
const mockRemote=jest.fn();
const mockLocal=jest.fn();
const mockSelect=jest.fn();
const mockEq=jest.fn();
const mockLimit=jest.fn();
jest.mock('@/lib/supabase',()=>({supabase:{from:()=>{
  const query={select:(s:string)=>{mockSelect(s);return query;},eq:(...args:unknown[])=>{mockEq(...args);return query;},order:()=>query,limit:(n:number)=>{mockLimit(n);return mockRemote();}};
  return query;
}}}));
jest.mock('@/lib/localDb/client',()=>({getLocalDb:async()=>({getAllAsync:(...args:unknown[])=>mockLocal(...args)})}));
const row={id:'session',dog_id:'dog',session_date:'2026-10-01',started_at:'2026-10-01T12:00:00Z',ended_at:'2026-10-01T12:10:00Z',distance:5,confidence:.9,segments:[{type:'straight',averageSpeedMps:1,analysisConfidence:.9}]};
beforeEach(()=>{jest.clearAllMocks();mockRemote.mockResolvedValue({data:[row],error:null});mockLocal.mockResolvedValue([]);});
it('bounds remote and local queries and scopes both to the authenticated owner and dog',async()=>{
  await getDogPaceHistory('owner','dog');
  expect(mockEq.mock.calls).toEqual([['owner_id','owner'],['dog_id','dog'],['type','track']]);
  expect(mockLimit).toHaveBeenCalledWith(30);
  expect(mockSelect.mock.calls[0][0]).not.toMatch(/\*|run_points|replay_points|notes/);
  expect(mockLocal).toHaveBeenCalledWith(expect.stringContaining('where user_id=? and dog_id=?'),'owner','dog',30);
});
it('retains local summaries offline and decodes SQLite JSON',async()=>{
  mockRemote.mockRejectedValue(new Error('offline'));
  mockLocal.mockResolvedValue([{...row,segments:JSON.stringify(row.segments)}]);
  const result=await getDogPaceHistory('owner','dog') as any[];
  expect(result[0].track_data.run.analytics.segments).toEqual(row.segments);
});
it('remote and local copies do not count as two sessions',async()=>{
  mockLocal.mockResolvedValue([{...row,segments:JSON.stringify(row.segments)}]);
  expect(await getDogPaceHistory('owner','dog')).toHaveLength(1);
});
it('fills absent remote analytics from local data without replacing complete remote data',async()=>{
  mockRemote.mockResolvedValue({data:[{...row,segments:null}],error:null});
  mockLocal.mockResolvedValue([{...row,segments:JSON.stringify(row.segments)}]);
  const result=await getDogPaceHistory('owner','dog') as any[];
  expect(result[0].track_data.run.analytics.segments).toEqual(row.segments);
});
it('degrades to no historical reference when both stores are unavailable',async()=>{
  mockRemote.mockResolvedValue({data:null,error:new Error('denied')});mockLocal.mockRejectedValue(new Error('unavailable'));
  expect(await getDogPaceHistory('owner','dog')).toEqual([]);
});
