import * as Speech from 'expo-speech';
import { requestVoice, resetVoiceEvents, voiceDiagnostics } from '../voiceEvents';
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

const speech = Speech.speak as jest.Mock;
const make = (onceKey: string, valid?: () => boolean, priority = 3) => ({
  eventType: 'approach' as const, text: 'Ansatz erreicht.', language: 'de-CH',
  priority, onceKey, phase: 'approach', valid,
});
beforeEach(() => { resetVoiceEvents(1000); speech.mockClear(); });

it('sends the early approach only once and records relative timing', () => {
  jest.useFakeTimers({ now: 2000 });
  resetVoiceEvents(1000);
  expect(requestVoice(make('approach'))).toBe(true);
  expect(requestVoice(make('approach'))).toBe(false);
  expect(speech).toHaveBeenCalledTimes(1);
  speech.mock.calls[0][1].onStart();
  expect(voiceDiagnostics().events.find(e => e.spokenTSec != null)).toMatchObject({ eventType: 'approach', triggerTSec: 1,
    queuedTSec: 1, spokenTSec: 1, delayMs: 0 });
  jest.useRealTimers();
});

it('suppresses a stale approach before native speech begins', () => {
  let inside = true;
  requestVoice(make('approach', () => inside));
  inside = false;
  speech.mock.calls[0][1].onStart();
  expect(voiceDiagnostics().events.some(e => e.suppressedReason === 'state_changed')).toBe(true);
});

it('keeps low-priority status from interrupting an active end announcement', () => {
  requestVoice({ ...make('end', undefined, 10), eventType: 'end' });
  expect(requestVoice({ ...make('status', undefined, 1), eventType: 'status' })).toBe(false);
  expect(speech).toHaveBeenCalledTimes(1);
});

it('ignores callbacks from speech interrupted by a newer event', () => {
  requestVoice(make('status', undefined, 1));
  const oldCallbacks = speech.mock.calls[0][1];
  requestVoice({ ...make('end', undefined, 10), eventType: 'end' });
  oldCallbacks.onStopped();
  expect(requestVoice({ ...make('late-status', undefined, 1), eventType: 'status' })).toBe(false);
  expect(speech).toHaveBeenCalledTimes(2);
});
