import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { shareTrackUserExport } from '../trackUserExportService';
import type { ReportLabels } from '../../utils/trackReportPdf';
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'cache/', makeDirectoryAsync: jest.fn(), readDirectoryAsync: jest.fn(async()=>[]), getInfoAsync: jest.fn(), writeAsStringAsync: jest.fn(), deleteAsync: jest.fn(async()=>{}) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async()=>true), shareAsync: jest.fn(async()=>{}) }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(()=>'a1-b2') }));
jest.mock('expo-asset', () => ({ Asset: {} }));
const labels = { title: 'Report' } as ReportLabels;
beforeEach(()=>{jest.clearAllMocks();(Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);(Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);(FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);});
it('keeps a successful share readable after the Android chooser opens',async()=>{
  await shareTrackUserExport({notes:'private'},'json',labels);
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith('cache/track-exports/anyvo-a1-b2.anyvo-track.json',expect.not.stringContaining('private'),{});
  expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({mimeType:'application/json'}));
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});
it('cleans only expired files in its own namespace, retaining recent and unrelated files',async()=>{
  (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(['anyvo-aaaa.pdf','anyvo-bbbb.gpx','foreign.pdf']);
  (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async(uri:string)=>({exists:true,isDirectory:false,modificationTime:Date.now()/1000-(uri.includes('aaaa')?90000:60)}));
  await shareTrackUserExport({},'gpx',labels);
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('cache/track-exports/anyvo-aaaa.pdf',{idempotent:true});
});
it('cleans failed exports and propagates failure without changing source data',async()=>{
  (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('share failed'));
  await expect(shareTrackUserExport({},'gpx',labels)).rejects.toThrow('share failed');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('cache/track-exports/anyvo-a1-b2.gpx',{idempotent:true});
});
it('writes no file if sharing is unavailable',async()=>{
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  await expect(shareTrackUserExport({},'gpx',labels)).rejects.toThrow('sharing-unavailable');
  expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
});
