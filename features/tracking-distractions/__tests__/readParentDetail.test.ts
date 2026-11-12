import { isParentNetworkFailure, readParentDetail } from '../readParentDetail';
const mockResponses: Record<string, unknown[]> = {}; const mockQueries: unknown[] = [];
jest.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
 const q: Record<string, unknown> = {}; for (const method of ['select','eq','order','range']) q[method] = (...a: unknown[]) => { mockQueries.push([table,method,...a]); return q; };
 q.maybeSingle = () => Promise.resolve(mockResponses[table].shift());
 q.then = (done: (r: unknown) => void) => Promise.resolve(mockResponses[table].shift()).then(done); return q;
} } }));
beforeEach(() => { mockQueries.length = 0; mockResponses.training_sessions = [{ data: { id: 's', owner_id: 'u', type: 'track' }, error: null }]; mockResponses.track_points = [{data:[],count:0,error:null}]; mockResponses.track_markers = [{data:[],count:0,error:null}]; });
it.each([401,403,500,0])('does not classify arbitrary status %s as offline', status => { expect(isParentNetworkFailure({ status, error: { message:'unauthorized' } })).toBe(false); });
it('only recognizes a failed transport', () => {
 expect(isParentNetworkFailure({status:0,error:{message:'TypeError: Network request failed'}})).toBe(true);
 expect(isParentNetworkFailure({status:403,error:{message:'Failed to fetch'}})).toBe(false);
});
it('reads owner/type-scoped complete pages and saved markers', async () => {
 mockResponses.track_points = [{data:Array.from({length:1000},(_,id)=>({id,latitude:47,longitude:8})),count:1001,error:null},{data:[{id:1000,latitude:47.01,longitude:8}],count:1001,error:null}];
 const r=await readParentDetail('s','u'); expect(r.error).toBeNull(); expect(r.data?.points).toHaveLength(1001);
 expect(mockQueries).toContainEqual(['training_sessions','eq','owner_id','u']); expect(mockQueries).toContainEqual(['training_sessions','eq','type','track']);
 expect(mockQueries).toContainEqual(['track_points','range',1000,1999]);
});
it('child permission failure does not become a partial valid snapshot', async () => {
 mockResponses.track_markers=[{data:null,error:{message:'forbidden'},status:403}]; const r=await readParentDetail('s','u'); expect(r.data).toBeNull(); expect(r.offline).toBe(false);
});
it('a shrinking or truncated page cannot silently shorten the track', async () => {
 mockResponses.track_points=[{data:[],count:2,error:null}]; expect((await readParentDetail('s','u')).error).toBeTruthy();
});

it('explicit child denial wins over simultaneous network failure', async () => {
 mockResponses.track_points=[{data:null,error:{message:'Network request failed'},status:0}];
 mockResponses.track_markers=[{data:null,error:{message:'forbidden',code:'42501'},status:403}];
 const r=await readParentDetail('s','u');expect(r.data).toBeNull();expect(r.offline).toBe(false);expect(r.denied).toBe(true);
});
