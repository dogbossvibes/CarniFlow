import { calculateHeading } from '@/features/tracking/utils/gpsFilter';
import { detectAutoCorner, type AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';
import { selectVoiceGuidanceCandidate, say } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import * as Speech from 'expo-speech';

const mockSpeechCalls: string[] = [];
jest.mock('expo-speech', () => ({
  stop: jest.fn(() => { mockSpeechCalls.push('stop'); }),
  speak: jest.fn((text: string, options?: { language?: string }) => {
    mockSpeechCalls.push(`speak:${text}${options?.language ? `:${options.language}` : ''}`);
  }),
}));

const METERS_PER_DEGREE = 111_320;
const RAD = Math.PI / 180;

function points(coords: readonly (readonly [number, number])[], accuracies: readonly number[] = []): AutoCornerPoint[] {
  let cumDist = 0;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      cumDist += Math.hypot(x - px, y - py);
    }
    return {
      lat: y / METERS_PER_DEGREE,
      lng: x / METERS_PER_DEGREE,
      cumDist,
      accuracy: accuracies[index] ?? 10,
    };
  });
}

function twoLeg(inHeadingDeg: number, outHeadingDeg: number, legM = 10, stepM = 2): (readonly [number, number])[] {
  const inR = inHeadingDeg * RAD;
  const outR = outHeadingDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let distance = legM; distance >= 0; distance -= stepM) coords.push([-Math.sin(inR) * distance, -Math.cos(inR) * distance]);
  for (let distance = stepM; distance <= legM; distance += stepM) coords.push([Math.sin(outR) * distance, Math.cos(outR) * distance]);
  return coords;
}

function legacyDetectBeforeFddd(input: readonly AutoCornerPoint[]): 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts' | null {
  const normalize = (value: number) => {
    let normalized = value;
    while (normalized > 180) normalized -= 360;
    while (normalized < -180) normalized += 360;
    return normalized;
  };
  const stableLeg = (from: number, to: number) => {
    if (to - from < 2) return false;
    const heading = calculateHeading(input[from], input[to]);
    for (let index = from; index < to; index++) {
      if (Math.abs(normalize(calculateHeading(input[index], input[index + 1]) - heading)) >= 12) return false;
    }
    return true;
  };
  const latest = input[input.length - 1];
  let best: { index: number; diff: number; magnitude: number } | null = null;
  for (let apexIndex = input.length - 2; apexIndex > 0; apexIndex--) {
    const apex = input[apexIndex];
    if (latest.cumDist - apex.cumDist < 4 || apex.accuracy == null || apex.accuracy > 20) continue;
    let inbound = apexIndex;
    while (inbound > 0 && apex.cumDist - input[inbound].cumDist < 4) inbound--;
    let outbound = apexIndex;
    while (outbound < input.length - 1 && input[outbound].cumDist - apex.cumDist < 4) outbound++;
    if (apex.cumDist - input[inbound].cumDist < 4 || input[outbound].cumDist - apex.cumDist < 4) continue;
    if (!stableLeg(inbound, apexIndex) || !stableLeg(apexIndex, outbound)) continue;
    const diff = normalize(calculateHeading(apex, input[outbound]) - calculateHeading(input[inbound], apex));
    if (!best || Math.abs(diff) > best.magnitude) best = { index: apexIndex, diff, magnitude: Math.abs(diff) };
  }
  if (!best || best.magnitude < 15) return null;
  const interior = Math.round(180 - best.magnitude);
  const direction = best.diff > 0 ? 'rechts' : 'links';
  if (interior >= 75 && interior <= 105) return direction;
  if (interior >= 30 && interior <= 60) return direction === 'rechts' ? 'spitz_rechts' : 'spitz_links';
  return null;
}

describe('Voice-Guidance-Diagnose — realistische Replays', () => {
  beforeEach(() => { mockSpeechCalls.length = 0; });

  it('A: speichert einen leicht ungeraden 90°-Winkel mit schwankender Accuracy', () => {
    const realistic = twoLeg(0, 90).map(([x, y], index) => [x + (index % 3 === 0 ? 0.15 : -0.1), y + (index % 4 === 0 ? -0.12 : 0.08)] as const);
    const accuracies = [8, 14, 19, 11, 24, 16, 12, 21, 10, 15, 18];
    const detected = detectAutoCorner(points(realistic, accuracies), -Infinity);

    expect(detected?.kind).toBe('rechts');
    const selection = selectVoiceGuidanceCandidate({
      dogProgressM: detected!.apex.cumDist - 6,
      angles: [{ id: 'angle-90', arcM: detected!.apex.cumDist, angleKind: detected!.kind }],
      objects: [], spokenIds: new Set(),
    });
    expect(selection.candidate?.id).toBe('angle-90');
    expect(selection.distanceM).toBeCloseTo(6);
  });

  it('B: ein Progress-Sprung hinter den virtuellen Hund unterdrückt den Winkel nachvollziehbar', () => {
    const selection = selectVoiceGuidanceCandidate({
      dogProgressM: 24,
      angles: [{ id: 'angle-late', arcM: 20, angleKind: 'rechts' }],
      objects: [], spokenIds: new Set(),
    });

    expect(selection.candidate).toBeNull();
    expect(selection.diagnostics).toMatchObject([{ id: 'angle-late', forwardDistanceM: null, suppression: 'behind_virtual_dog' }]);
  });

  it('C: Winkel gewinnt bei Nähe; Gegenstand bleibt nach Ablauf des Cooldowns auswählbar', () => {
    const first = selectVoiceGuidanceCandidate({
      dogProgressM: 14,
      angles: [{ id: 'angle', arcM: 20, angleKind: 'rechts' }],
      objects: [{ id: 'object', arcM: 21 }], spokenIds: new Set(),
    });
    expect(first.candidate?.id).toBe('angle');

    const afterCooldown = selectVoiceGuidanceCandidate({
      dogProgressM: 15,
      angles: [{ id: 'angle', arcM: 20, angleKind: 'rechts' }],
      objects: [{ id: 'object', arcM: 21 }], spokenIds: new Set(['angle']),
    });
    expect(afterCooldown.candidate?.id).toBe('object');
    expect(afterCooldown.distanceM).toBe(6);
  });

  it('D: ein gleichzeitig eintreffendes Off-track-say() ersetzt eine laufende Winkelansage', () => {
    expect(say('Rechtswinkel in ca. 6 Schritten.', 'de')).toBe(true);
    expect(say('Du bist neben der Fährte.', 'de')).toBe(true);

    expect(mockSpeechCalls).toEqual([
      'stop',
      'speak:Rechtswinkel in ca. 6 Schritten.:de-CH',
      'stop',
      'speak:Du bist neben der Fährte.:de-CH',
    ]);
  });

  it('E: ein nachfolgendes Winkel-say() stoppt eine direkte Teilstreckenansage', () => {
    // Teilstrecken und der Suchstart rufen Speech.speak direkt auf. Off-track,
    // Winkel und Gegenstände verwenden say() (stop → speak).
    Speech.speak('Teilstrecke beginnt.');
    expect(say('Rechtswinkel in ca. 6 Schritten.', 'de')).toBe(true);

    expect(mockSpeechCalls).toEqual([
      'speak:Teilstrecke beginnt.',
      'stop',
      'speak:Rechtswinkel in ca. 6 Schritten.:de-CH',
    ]);
  });

  it('F: englische App-Locale nutzt en-GB für TTS', () => {
    expect(say('Right corner in about 6 steps.', 'en')).toBe(true);

    expect(mockSpeechCalls).toEqual([
      'stop',
      'speak:Right corner in about 6 steps.:en-GB',
    ]);
  });

  it('fddd1f1: repräsentative, zuvor akzeptierte 90°-Geometrie bleibt akzeptiert', () => {
    const replay = points(twoLeg(0, 90), [8, 10, 14, 18, 19, 15, 12, 17, 16, 13, 11]);
    expect(legacyDetectBeforeFddd(replay)).toBe('rechts');
    expect(detectAutoCorner(replay, -Infinity)?.kind).toBe('rechts');
  });
});
