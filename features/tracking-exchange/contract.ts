import type { TrackDetailMap, DetailMarker } from '@/features/tracking/utils/trackDetailMap';
import type { ParentReference } from '@/features/tracking-distractions/parentReference';
import { parseDistractionTrack, distractionDistance, type DistractionTrack } from '@/features/tracking-distractions/model';

export const FILE_LIMIT = 4 * 1024 * 1024;
export const FILE_EXTENSION = 'anyvo-track';
export class ExchangeError extends Error {
 constructor(readonly code: 'INVALID' | 'TOO_LARGE' | 'ACCOUNT_CHANGED' | 'CONFLICT' | 'NOT_FOUND' | 'ACTIVE_REQUIRED' | 'UNAVAILABLE') { super(code); }
}
export function assert(value: unknown): asserts value { if (!value) throw new ExchangeError('INVALID'); }
export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
 assert(value && typeof value === 'object' && !Array.isArray(value)); const v = value as Record<string, unknown>;
 assert(Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))); return v;
}
export function uuid(value: unknown): string { assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)); return value; }
export function finite(value: unknown, min: number, max: number): number { assert(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max); return value; }
function label(value: unknown, max: number): string { assert(typeof value === 'string' && value.trim().length && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)); return value; }
function nullableNumber(value: unknown, max: number) { return value === null ? null : finite(value, 0, max); }
function choice<T extends string>(value: unknown, values: readonly T[]): T | null { assert(value === null || values.includes(value as T)); return value as T | null; }
export interface ExchangeReference {
 version: 1; points: { lat: number; lng: number; breakBefore: boolean }[];
 markers: ExchangeMarker[];
 distanceM: number | null; date: string | null;
}
export interface ExchangeMarker extends Pick<DetailMarker, 'id' | 'type' | 'angleKind' | 'material' | 'distanceFromStart'> {
 lat: number; lng: number; geometryDirection: 'links' | 'rechts' | 'unresolved' | null; geometrySharpness: 'normal' | 'sharp' | 'unresolved' | null;
}
export function parseReference(value: unknown): ExchangeReference {
 const v = record(value, ['version', 'points', 'markers', 'distanceM', 'date']); assert(v.version === 1);
 assert(Array.isArray(v.points) && v.points.length >= 2 && v.points.length <= 20000);
 assert(Array.isArray(v.markers) && v.markers.length <= 256);
 const points = v.points.map(raw => { const p = record(raw, ['lat', 'lng', 'breakBefore']); assert(typeof p.breakBefore === 'boolean');
  return { lat: finite(p.lat, -90, 90), lng: finite(p.lng, -180, 180), breakBefore: p.breakBefore }; });
 assert(points.some((p,i) => i > 0 && !p.breakBefore && (p.lat !== points[i-1].lat || p.lng !== points[i-1].lng)));
 const markers = v.markers.map(raw => {
  const m = record(raw, ['id','type','lat','lng','angleKind','material','distanceFromStart','geometryDirection','geometrySharpness']);
  const type = choice(m.type, ['gegenstand','winkel','verleitung'] as const); assert(type);
  return { id: label(m.id, 100), type, lat: finite(m.lat,-90,90), lng: finite(m.lng,-180,180),
   angleKind: choice(m.angleKind, ['links','rechts','spitz_links','spitz_rechts','spitz','absatz','abriss','gw','ow','bw'] as const),
   material: choice(m.material, ['stoff','filz','holz','duebel','leder','plastik','metall','teppich','diverses'] as const),
   distanceFromStart: nullableNumber(m.distanceFromStart, 1000000),
   geometryDirection: choice(m.geometryDirection, ['links','rechts','unresolved'] as const), geometrySharpness: choice(m.geometrySharpness, ['normal','sharp','unresolved'] as const) };
 });
 assert(new Set(markers.map(m=>m.id)).size === markers.length);
 assert(v.date === null || typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.date) && Number.isFinite(Date.parse(v.date)));
 return { version: 1, points, markers, distanceM: nullableNumber(v.distanceM, 1000000), date: v.date as string | null };
}
export function referenceFromMap(map: TrackDetailMap, date: string | null): ExchangeReference {
 return parseReference({ version: 1, points: map.lay.map(p=>({lat:p.lat,lng:p.lng,breakBefore:p.breakBefore===true})),
  markers: map.markers.filter(m=>m.type !== 'sprachmarker').map(m=>({id:m.id,type:m.type,lat:m.lat,lng:m.lng,angleKind:m.angleKind,material:m.material,distanceFromStart:m.distanceFromStart,geometryDirection:m.geometryDirection??null,geometrySharpness:m.geometrySharpness??null})),
  distanceM: map.totalDistanceM, date: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null });
}
/** Explicitly a local reference for the helper, never a training session or source ownership claim. */
export function displayReference(reference: ExchangeReference, localParentId: string, ownerId: string): ParentReference {
 const r = parseReference(reference);let objectIndex=0;
 const corners=r.markers.filter(m=>m.type==='winkel'&&m.angleKind!=='abriss'&&m.angleKind!=='absatz').map(m=>m.distanceFromStart??0);
 return {version:1,id:localParentId,ownerId,dogId:'',date:r.date,distanceM:r.distanceM,map:{lay:r.points,run:[],start:r.points[0],end:r.points.at(-1)!,hasLay:true,hasRun:false,totalDistanceM:r.distanceM,
  markers:r.markers.map(m=>{const numbered=m.type==='gegenstand'&&m.material!=='duebel';return {...m,geometryDirection:m.geometryDirection??undefined,geometrySharpness:m.geometrySharpness??undefined,note:null,objectIndex:numbered?++objectIndex:null,legIndex:numbered&&m.distanceFromStart!==null?1+corners.filter(d=>d<=m.distanceFromStart!).length:null};})}};
}
export interface TrackOffer { format:'anyvo-track'; version:1; kind:'distraction-request'; taskId:string; title:string; referenceDigest:string; reference:ExchangeReference }
export interface TrackReturn { format:'anyvo-track'; version:1; kind:'distraction-return'; taskId:string; referenceDigest:string; contribution:DistractionTrack }
export type TrackFile = TrackOffer | TrackReturn;
export function canonicalReference(value: ExchangeReference): string { return JSON.stringify(parseReference(value)); }
export function parseFile(value: unknown): TrackFile {
 assert(value && typeof value === 'object'); const kind=(value as Record<string,unknown>).kind;
 const v=record(value,kind==='distraction-request'?['format','version','kind','taskId','title','referenceDigest','reference']:['format','version','kind','taskId','referenceDigest','contribution']);
 assert(v.format==='anyvo-track' && v.version===1 && (kind==='distraction-request'||kind==='distraction-return'));
 const taskId=uuid(v.taskId); assert(typeof v.referenceDigest==='string' && /^[a-f0-9]{64}$/.test(v.referenceDigest));
 const common={format:'anyvo-track' as const,version:1 as const,taskId,referenceDigest:v.referenceDigest};
 if(kind==='distraction-request')return {...common,kind,title:label(v.title,80),reference:parseReference(v.reference)};
 const contribution=parseDistractionTrack(v.contribution);
 assert(contribution.parentSessionId===taskId && contribution.finishedAtMs!==null && distractionDistance(contribution.points)>0);
 return {...common,kind,contribution};
}
export function parseFileText(text:string):TrackFile {
 // An ASCII JSON file is the maximum byte/character ratio case; reject before parsing.
 if(text.length>FILE_LIMIT)throw new ExchangeError('TOO_LARGE');
 try { if(unescape(encodeURIComponent(text)).length>FILE_LIMIT)throw new ExchangeError('TOO_LARGE'); return parseFile(JSON.parse(text)); }
 catch(e){if(e instanceof ExchangeError)throw e;throw new ExchangeError('INVALID');}
}
