import { isLiveShareReleaseReady } from '../releaseGate';
it('activates the independently accepted live client for the reviewed release', () => {
 expect(isLiveShareReleaseReady()).toBe(true);
});
