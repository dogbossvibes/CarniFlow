import { isLiveShareReleaseReady } from '../releaseGate';
it('keeps the unfinished server/ACTIVE/HTTP release disabled in the production candidate', () => {
 expect(isLiveShareReleaseReady()).toBe(false);
});
