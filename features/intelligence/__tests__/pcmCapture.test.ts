import { createPcmCapturePort } from '../pcmCapture';
import { AUDIO_CLEANUP_KEY, createAudioCleanup } from '../audioCleanup';
const uri = 'file:///cache/ExpoAudio/recording-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.wav';
function setup() {
  const records = new Map<string,string>();
  const storage = { getItem: jest.fn(async (k: string) => records.get(k) ?? null), setItem: jest.fn(async (k: string, v: string) => { records.set(k,v); }) };
  let exists = true;
  const files = { info: jest.fn(async (_uri: string) => ({ exists, size: 46, isDirectory: false })), remove: jest.fn(async (_uri: string) => { exists = false; }), bytes: jest.fn(async () => new Uint8Array(46)) };
  const recorder = { uri, prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}), release: jest.fn() };
  const cleanup = createAudioCleanup(storage, files, 'file:///cache/');
  const deps = { available: () => true, permitted: async () => true, mode: jest.fn(async () => {}), create: jest.fn(() => recorder), files, cleanup, audioIdle: jest.fn(() => true) };
  return { records, storage, files, recorder, cleanup, deps, port: createPcmCapturePort(deps) };
}
it('registers exact own URI before native prepare/record and verifies deletion after release', async () => {
  const s = setup(); s.recorder.prepareToRecordAsync.mockImplementation(async () => { expect(s.records.get(AUDIO_CLEANUP_KEY)).toContain(uri); });
  const take = await s.port.prepare(new AbortController().signal); expect(s.recorder.record).not.toHaveBeenCalled();
  take.start(); expect(s.recorder.record).toHaveBeenCalledWith({ forDuration: 60 }); await take.bytes();
  expect(await take.close()).toBe(true); expect(s.recorder.stop).toHaveBeenCalledTimes(1); expect(s.recorder.release).toHaveBeenCalledTimes(1);
  expect(s.records.get(AUDIO_CLEANUP_KEY)).toBe('[]'); expect(await take.close()).toBe(true);
});
it('journal failure never starts recording and only removes the fresh empty own file', async () => {
  const s = setup(); s.storage.setItem.mockRejectedValue(new Error('Disk unavailable'));
  await expect(s.port.prepare(new AbortController().signal)).rejects.toThrow();
  expect(s.recorder.prepareToRecordAsync).not.toHaveBeenCalled(); expect(s.recorder.record).not.toHaveBeenCalled();
  expect(s.files.remove).toHaveBeenCalledWith(uri);
});
it('rejects arbitrary/legacy paths without deleting them', async () => {
  const s = setup(); s.recorder.uri = 'file:///cache/voice/legacy.m4a';
  await expect(s.port.prepare(new AbortController().signal)).rejects.toThrow();
  expect(s.files.remove).not.toHaveBeenCalled(); expect(s.recorder.record).not.toHaveBeenCalled();
});
it('module-wide lease prevents a second candidate from recovering/deleting an active take', async () => {
  const s = setup(); const take = await s.port.prepare(new AbortController().signal);
  const second = createPcmCapturePort(s.deps); expect(await second.recover()).toBe(false);
  await expect(second.prepare(new AbortController().signal)).rejects.toThrow(); expect(s.files.remove).not.toHaveBeenCalled();
  expect(await take.close()).toBe(true);
});
it('late cancelled prepare never records and retains responsibility for its own file', async () => {
  const s = setup(); const abort = new AbortController();
  s.recorder.prepareToRecordAsync.mockImplementation(async () => { abort.abort(); });
  await expect(s.port.prepare(abort.signal)).rejects.toThrow(); expect(s.recorder.record).not.toHaveBeenCalled();
  expect(s.files.remove).toHaveBeenCalledWith(uri);
});
it('oversized file is rejected before reading bytes', async () => {
  const s = setup(); const take = await s.port.prepare(new AbortController().signal); take.start();
  s.files.info.mockResolvedValue({ exists: true, size: 1985537, isDirectory: false });
  await expect(take.bytes()).rejects.toThrow(); expect(s.files.bytes).not.toHaveBeenCalled(); s.files.info.mockRestore();
  s.files.info.mockResolvedValue({ exists: false, size: 0, isDirectory: false }); await take.close();
});
it('failed stop retains lease and journal; explicit close can retry without unsafe deletion', async () => {
  const s = setup(); const take = await s.port.prepare(new AbortController().signal); take.start();
  s.recorder.stop.mockRejectedValueOnce(new Error('Native stop failed'));
  expect(await take.close()).toBe(false); expect(s.files.remove).not.toHaveBeenCalled(); expect(await s.port.recover()).toBe(false);
  expect(await take.close()).toBe(true); expect(s.files.remove).toHaveBeenCalledTimes(1);
});
it('malformed cleanup journals fail closed without scanning or deleting files', async () => {
  const s = setup(); s.records.set(AUDIO_CLEANUP_KEY, JSON.stringify(['file:///cache/foreign.wav']));
  expect(await s.cleanup.recover()).toBe(false); expect(s.files.remove).not.toHaveBeenCalled();
});
it('failed deletion remains journalled and scoped recovery needs exists=false confirmation', async () => {
  const s = setup(); await s.cleanup.register(uri); s.files.remove.mockImplementation(async () => {});
  expect(await s.cleanup.cleanup(uri)).toBe(false); expect(s.records.get(AUDIO_CLEANUP_KEY)).toContain(uri);
  expect(await s.cleanup.recover()).toBe(false); s.files.info.mockResolvedValue({ exists: false, size: 0, isDirectory: false });
  expect(await s.cleanup.recover()).toBe(true); expect(s.records.get(AUDIO_CLEANUP_KEY)).toBe('[]');
});
