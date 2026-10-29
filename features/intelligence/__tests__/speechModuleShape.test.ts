import { inspectSpeechModuleShape, SPEECH_METHODS } from '../speechModuleShape';
const complete = () => Object.fromEntries(SPEECH_METHODS.map(method => [method, jest.fn()]));
it.each([null, undefined, {}, [], 'module'])('fails closed for absent or incomplete native module (%#)', module => {
  expect(inspectSpeechModuleShape(module)).toEqual({ apiShapeAvailable: false, missingMethods: [...SPEECH_METHODS], deviceVerified: false, localOnlyVerified: false });
});
it.each(SPEECH_METHODS)('requires the actual callable %s method', method => {
  const module = { ...complete(), [method]: true }; const result = inspectSpeechModuleShape(module);
  expect(result.apiShapeAvailable).toBe(false); expect(result.missingMethods).toEqual([method]);
});
it('checks methods without invoking permissions, recognition or availability APIs', () => {
  const module = complete(); const result = inspectSpeechModuleShape(module);
  expect(result).toEqual({ apiShapeAvailable: true, missingMethods: [], deviceVerified: false, localOnlyVerified: false });
  for (const method of SPEECH_METHODS) expect(module[method]).not.toHaveBeenCalled();
});
it('handles a throwing native property getter without crashing', () => {
  const module = complete(); Object.defineProperty(module, 'start', { get() { throw new Error('module unavailable'); } });
  expect(inspectSpeechModuleShape(module).missingMethods).toEqual(['start']);
});
it('accepts inherited native methods while retaining all runtime gates', () => {
  const module: unknown = Object.create(complete());
  expect(inspectSpeechModuleShape(module)).toMatchObject({ apiShapeAvailable: true, deviceVerified: false, localOnlyVerified: false });
});
