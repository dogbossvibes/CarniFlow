import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { shareTrackUserExport } from '../trackUserExportService';
import { resetHomeZoneCacheForTests } from '@/features/home-zone/store';
import { insideHomeZone } from '@/features/home-zone/zones';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: jest.fn(async () => {}), readDirectoryAsync: jest.fn(async () => []), getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(async () => {}), writeAsStringAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));

const zone = { id: 'home', lat: 47, lng: 8, radiusM: 200 };
const session = { id: 's', dog_id: 'd', dog: { name: 'Testhund' }, session_date: '2026-11-16',
  points: [47.0002, 47.0010, 47.0030, 47.0040].map((latitude, i) => ({ latitude, longitude: 8, point_type: 'lay', timestamp: `2026-11-16T10:00:0${i}.000Z` })),
  markers: [{ marker_type: 'gegenstand', material: 'holz', latitude: 47.0003, longitude: 8 }] };
const written = () => (FileSystem.writeAsStringAsync as jest.Mock).mock.calls.at(-1)?.[1] as string;
const coordinates = (gpx: string) => [...gpx.matchAll(/lat="([-\d.]+)" lon="([-\d.]+)"/g)].map(m => ({ lat: Number(m[1]), lng: Number(m[2]) }));

beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); resetHomeZoneCacheForTests(); });

describe('Export mit Heimzone', () => {
  it('schreibt eine GPX-Datei ohne Koordinaten innerhalb der Zone', async () => {
    await AsyncStorage.setItem('anyvo_home_zones_v1', JSON.stringify([zone]));
    await shareTrackUserExport(session, 'gpx', {} as never);
    const points = coordinates(written());
    expect(points).toEqual([{ lat: 47.003, lng: 8 }, { lat: 47.004, lng: 8 }]);
    expect(points.some(p => insideHomeZone(p, [zone]))).toBe(false);
  });
  it('schreibt auch als JSON keine Koordinaten innerhalb der Zone', async () => {
    await AsyncStorage.setItem('anyvo_home_zones_v1', JSON.stringify([zone]));
    await shareTrackUserExport(session, 'json', {} as never);
    const data = JSON.parse(written());
    expect(data.homeZoneApplied).toBe(true);
    expect(data.markers).toEqual([]);
    expect(data.reference.flat().every((p: { lat: number; lng: number }) => !insideHomeZone(p, [zone]))).toBe(true);
  });
  it('ohne Zone bleibt der Export vollständig', async () => {
    await shareTrackUserExport(session, 'gpx', {} as never);
    expect(coordinates(written())).toHaveLength(5);
  });
  it('teilt nichts, wenn die Zonen nicht lesbar sind oder die GPX-Datei leer wäre', async () => {
    await AsyncStorage.setItem('anyvo_home_zones_v1', '{kaputt');
    await expect(shareTrackUserExport(session, 'gpx', {} as never)).rejects.toThrow('home-zone-storage');
    resetHomeZoneCacheForTests();
    await AsyncStorage.setItem('anyvo_home_zones_v1', JSON.stringify([{ ...zone, radiusM: 500 }]));
    await expect(shareTrackUserExport(session, 'gpx', {} as never)).rejects.toThrow('home-zone-empty');
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });
});
