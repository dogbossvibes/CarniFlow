import * as Speech from 'expo-speech';
import { cancelVoiceEvents, requestVoice, resetVoiceEvents, VOICE_QUEUE, voiceDiagnostics } from '../voiceEvents';
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

const speech = Speech.speak as jest.Mock;
const make = (onceKey: string, valid?: () => boolean, priority = 3) => ({
  eventType: 'approach' as const, text: 'Ansatz erreicht.', language: 'de-CH',
  priority, onceKey, phase: 'approach', valid,
});
beforeEach(() => { resetVoiceEvents(1000); speech.mockClear(); (Speech.stop as jest.Mock).mockClear(); });

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

it('keeps low-priority status from interrupting an active end announcement — it waits and follows', () => {
  requestVoice({ ...make('end', undefined, 10), eventType: 'end' });
  expect(requestVoice({ ...make('status', undefined, 1), eventType: 'status', text: 'Status' })).toBe(true);
  expect(speech).toHaveBeenCalledTimes(1);
  expect(Speech.stop).not.toHaveBeenCalled();
  speech.mock.calls[0][1].onDone();
  expect(speech).toHaveBeenCalledTimes(2);
  expect(speech.mock.calls[1][0]).toBe('Status');
});

it('ignores callbacks from speech interrupted by a newer event', () => {
  requestVoice(make('status', undefined, 1));
  const oldCallbacks = speech.mock.calls[0][1];
  requestVoice({ ...make('end', undefined, 10), eventType: 'end' });
  expect(Speech.stop).toHaveBeenCalledTimes(1);          // nur die klar wichtigere Ansage unterbricht
  oldCallbacks.onStopped();                               // veralteter Rückruf gibt nichts frei
  requestVoice({ ...make('late-status', undefined, 1), eventType: 'status' });
  expect(speech).toHaveBeenCalledTimes(2);                // wartet hinter der Ende-Ansage
  speech.mock.calls[1][1].onDone();
  expect(speech).toHaveBeenCalledTimes(3);
});

describe('Ansagen nacheinander statt abgeschnitten (T-204)', () => {
  const feature = (key: string, text: string, valid?: () => boolean) => ({ ...make(key, valid, 4), eventType: 'angle' as const, text });
  afterEach(() => { jest.useRealTimers(); });

  it('gleiche Priorität: die zweite Ansage bricht die erste nicht ab, sondern folgt danach', () => {
    requestVoice(feature('a', 'Rechtswinkel'));
    requestVoice(feature('b', 'Gegenstand'));
    expect(speech).toHaveBeenCalledTimes(1);
    expect(Speech.stop).not.toHaveBeenCalled();
    speech.mock.calls[0][1].onDone();
    expect(speech.mock.calls.map(c => c[0])).toEqual(['Rechtswinkel', 'Gegenstand']);
  });

  it('wartende Ansagen: die wichtigste zuerst, bei Gleichstand die ältere', () => {
    requestVoice(feature('a', 'läuft'));
    requestVoice({ ...make('s1', undefined, 1), eventType: 'status', text: 'Status' });
    requestVoice(feature('b', 'Winkel 1'));
    requestVoice(feature('c', 'Winkel 2'));
    speech.mock.calls[0][1].onDone();
    speech.mock.calls[1][1].onDone();
    speech.mock.calls[2][1].onDone();
    expect(speech.mock.calls.map(c => c[0])).toEqual(['läuft', 'Winkel 1', 'Winkel 2', 'Status']);
  });

  it('eine wartende Ansage, die nicht mehr gilt, wird nicht mehr gesprochen', () => {
    let ahead = true;
    requestVoice(feature('a', 'läuft'));
    requestVoice(feature('b', 'vorbei', () => ahead));
    ahead = false;
    speech.mock.calls[0][1].onDone();
    expect(speech).toHaveBeenCalledTimes(1);
    expect(voiceDiagnostics().events.some(e => e.suppressedReason === 'state_changed')).toBe(true);
  });

  it('eine zu lange wartende Ansage entfällt; danach ist die Ausgabe wieder frei', () => {
    jest.useFakeTimers({ now: 50_000 });
    requestVoice(feature('a', 'läuft'));
    requestVoice(feature('c', 'zu alt'));
    jest.setSystemTime(50_000 + VOICE_QUEUE.maxAgeMs + 1);
    speech.mock.calls[0][1].onDone();
    expect(speech).toHaveBeenCalledTimes(1);
    expect(voiceDiagnostics().events.some(e => e.suppressedReason === 'queue_expired')).toBe(true);
    requestVoice(feature('d', 'neu'));
    expect(speech).toHaveBeenCalledTimes(2);
  });

  it('Überlauf: höchstens drei warten, die unwichtigste entfällt', () => {
    requestVoice(feature('a', 'läuft'));
    requestVoice({ ...make('s1', undefined, 1), eventType: 'status', text: 'Status' });
    requestVoice(feature('b', 'B')); requestVoice(feature('c', 'C')); requestVoice(feature('d', 'D'));
    for (let i = 0; i < 4; i++) speech.mock.calls[i]?.[1].onDone();
    expect(speech.mock.calls.map(c => c[0])).toEqual(['läuft', 'B', 'C', 'D']);
    expect(voiceDiagnostics().events.some(e => e.suppressedReason === 'queue_overflow')).toBe(true);
  });

  it('bleibt die Rückmeldung der Sprachausgabe aus, blockiert das die folgenden Ansagen nicht', () => {
    jest.useFakeTimers({ now: 80_000 });
    requestVoice(feature('a', 'hängt'));
    jest.setSystemTime(80_000 + VOICE_QUEUE.maxSpeakMs + 1);
    requestVoice(feature('b', 'weiter'));
    expect(speech.mock.calls.map(c => c[0])).toEqual(['hängt', 'weiter']);
  });

  it('Stummschalten/Verlassen verwirft Wartendes', () => {
    requestVoice(feature('a', 'läuft'));
    requestVoice(feature('b', 'wartet'));
    cancelVoiceEvents();
    speech.mock.calls[0][1].onStopped();
    expect(speech).toHaveBeenCalledTimes(1);
  });

  it('eine Ansage, die beim Sprechbeginn nicht mehr gilt, gibt die nächste frei', () => {
    let ok = true;
    requestVoice(feature('a', 'veraltet', () => ok));
    requestVoice(feature('b', 'folgt'));
    ok = false;
    speech.mock.calls[0][1].onStart();
    expect(speech.mock.calls.map(c => c[0])).toEqual(['veraltet', 'folgt']);
  });
});
