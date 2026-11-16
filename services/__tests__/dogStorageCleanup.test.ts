/* eslint-disable import/first */
// Hund löschen räumt hochgeladene Dateien auf (Datenschutz), ohne Kundendaten
// zu gefährden: Dateien werden nur nach bestätigtem Löschen entfernt, nur im
// eigenen Ordner und nie, wenn ein anderer Hund dieselbe Datei nutzt.

const OWNER = 'owner-1';
const DOG = 'dog-1';
const BASE = 'https://proj.supabase.co/storage/v1/object/public';

type Rows = Record<string, unknown>[];
let tables: Record<string, Rows>;
let otherDogsWithPhoto: Rows;
let dogDelete: { data: Rows | null; error: { message: string } | null };
let mockDocFolder: { id: string | null; name: string }[];
const mockRemoved: { bucket: string; paths: string[] }[] = [];
const mockCalls: string[] = [];

function mockQuery(table: string) {
  const state: { neq?: boolean; isDelete?: boolean } = {};
  const result = () => {
    if (state.isDelete) {
      mockCalls.push(`delete:${table}`);
      return table === 'dogs' ? dogDelete : { data: null, error: null };
    }
    if (table === 'dogs' && state.neq) return { data: otherDogsWithPhoto, error: null };
    return { data: tables[table] ?? [], error: null };
  };
  const q: any = {
    select: () => q, eq: () => q, in: () => q, limit: () => q,
    neq: () => { state.neq = true; return q; },
    delete: () => { state.isDelete = true; return q; },
    maybeSingle: () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
  };
  return q;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'owner-1' } } })) },
    from: jest.fn((t: string) => mockQuery(t)),
    storage: {
      from: jest.fn((bucket: string) => ({
        list: jest.fn(() => Promise.resolve({ data: bucket === 'dog-documents' ? mockDocFolder : [], error: null })),
        remove: jest.fn((paths: string[]) => {
          mockCalls.push(`remove:${bucket}`);
          mockRemoved.push({ bucket, paths });
          return Promise.resolve({ data: [], error: null });
        }),
      })),
    },
  },
}));

import { deleteDogWithDependents } from '@/services/dogs';
import { toStorageRef } from '@/services/dogStorageCleanup';

const allRemoved = () => mockRemoved.flatMap(r => r.paths.map(p => `${r.bucket}/${p}`)).sort();

beforeEach(() => {
  mockRemoved.length = 0;
  mockCalls.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  otherDogsWithPhoto = [];
  mockDocFolder = [];
  dogDelete = { data: [{ id: DOG }], error: null };
  tables = {
    dogs: [{ photo_url: `${BASE}/dog-avatars/${OWNER}/111.jpg` }],
    dog_documents: [{ file_url: `${OWNER}/${DOG}/222_impfpass.pdf` }],
    training_sessions: [{
      id: 'sess-1',
      photo_urls: [`${BASE}/training-photos/${OWNER}/333.jpg`],
      video_url: `${BASE}/training-videos/${OWNER}/444.mp4`,
      audio_urls: [`${BASE}/media-audio/trainer-9/555.m4a`],          // fremder Ordner
    }],
    training_units: [{
      id: 'unit-1',
      photos: [`${BASE}/media-images/${OWNER}/666.jpg`],
      videos: ['https://example.com/extern.mp4'],                     // nicht unser Speicher
      audio_files: [{ url: `${BASE}/media-audio/${OWNER}/777.m4a` }],
    }],
    voice_notes: [{ audio_url: `${BASE}/media-audio/${OWNER}/888.m4a` }],
  };
});

afterEach(() => jest.restoreAllMocks());

describe('deleteDogWithDependents — Dateien aufräumen', () => {
  it('entfernt eigene Dateien des Hundes erst nach bestätigtem Löschen', async () => {
    mockDocFolder = [{ id: 'f1', name: '222_impfpass.pdf' }, { id: 'f2', name: '999_verwaist.pdf' }];
    const res = await deleteDogWithDependents(DOG);
    expect(res).toEqual({ error: null });
    expect(allRemoved()).toEqual([
      `dog-avatars/${OWNER}/111.jpg`,
      `dog-documents/${OWNER}/${DOG}/222_impfpass.pdf`,
      `dog-documents/${OWNER}/${DOG}/999_verwaist.pdf`,
      `media-audio/${OWNER}/777.m4a`,
      `media-audio/${OWNER}/888.m4a`,
      `media-images/${OWNER}/666.jpg`,
      `media-images/${OWNER}/666_thumb.jpg`,
      `training-photos/${OWNER}/333.jpg`,
      `training-videos/${OWNER}/444.mp4`,
    ].sort());
    expect(mockCalls.indexOf('delete:dogs')).toBeLessThan(mockCalls.findIndex(c => c.startsWith('remove:')));
  });

  it('lässt fremde und externe Dateien unangetastet', async () => {
    await deleteDogWithDependents(DOG);
    expect(allRemoved().some(p => p.includes('trainer-9'))).toBe(false);
    expect(allRemoved().some(p => p.includes('extern'))).toBe(false);
  });

  it('löscht keine Datei, wenn das Löschen des Hundes fehlschlägt', async () => {
    dogDelete = { data: null, error: { message: 'boom' } };
    const res = await deleteDogWithDependents(DOG);
    expect(res.error?.message).toBe('boom');
    expect(mockRemoved).toEqual([]);
  });

  it('löscht keine Datei, wenn die Datenbank 0 Zeilen löscht (z. B. RLS)', async () => {
    dogDelete = { data: [], error: null };
    await deleteDogWithDependents(DOG);
    expect(mockRemoved).toEqual([]);
  });

  it('behält das Hundefoto, wenn ein anderer Hund es nutzt', async () => {
    otherDogsWithPhoto = [{ id: 'dog-2' }];
    await deleteDogWithDependents(DOG);
    expect(allRemoved()).not.toContain(`dog-avatars/${OWNER}/111.jpg`);
    expect(allRemoved()).toContain(`training-photos/${OWNER}/333.jpg`);
  });
});

describe('toStorageRef', () => {
  it('erkennt öffentliche und signierte URLs sowie Dokumentpfade', () => {
    expect(toStorageRef(`${BASE}/dog-avatars/${OWNER}/a%20b.jpg`, OWNER))
      .toEqual({ bucket: 'dog-avatars', path: `${OWNER}/a b.jpg` });
    expect(toStorageRef(`https://proj.supabase.co/storage/v1/object/sign/dog-documents/${OWNER}/d/x.pdf?token=t`, OWNER))
      .toEqual({ bucket: 'dog-documents', path: `${OWNER}/d/x.pdf` });
    expect(toStorageRef(`${OWNER}/d/x.pdf`, OWNER, 'dog-documents'))
      .toEqual({ bucket: 'dog-documents', path: `${OWNER}/d/x.pdf` });
  });

  it('lehnt fremde Ordner, unbekannte Buckets und Pfad-Tricks ab', () => {
    expect(toStorageRef(`${BASE}/dog-avatars/other/a.jpg`, OWNER)).toBeNull();
    expect(toStorageRef(`${BASE}/secret-bucket/${OWNER}/a.jpg`, OWNER)).toBeNull();
    expect(toStorageRef(`${BASE}/dog-avatars/${OWNER}/../other/a.jpg`, OWNER)).toBeNull();
    expect(toStorageRef(`${OWNER}/a.jpg`, OWNER)).toBeNull();                // reiner Pfad ohne Bucket
    expect(toStorageRef(null, OWNER)).toBeNull();
  });
});
