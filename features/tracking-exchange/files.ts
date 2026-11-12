import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { FILE_EXTENSION, FILE_LIMIT, ExchangeError, canonicalReference, parseFileText, parseFile, type TrackFile } from './contract';
const MIME='application/vnd.anyvo.track+json';
export async function importTrackFile(check:()=>void):Promise<TrackFile|null>{
 check();const picked=await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true,multiple:false});check();
 if(picked.canceled)return null;const asset=picked.assets[0];if(!asset)throw new ExchangeError('INVALID');
 try {if(!asset.name.toLowerCase().endsWith(`.${FILE_EXTENSION}`))throw new ExchangeError('INVALID');return await readTrackFile(asset.uri,check);} finally {if(isCacheUri(asset.uri))await FileSystem.deleteAsync(asset.uri,{idempotent:true}).catch(()=>undefined);}
}
function isCacheUri(uri:string):boolean {
 try {if(!FileSystem.cacheDirectory||/[?#]|%2e|%2f|%5c/i.test(uri))return false;const url=new URL(uri),base=new URL(FileSystem.cacheDirectory);return url.protocol==='file:'&&url.host===base.host&&decodeURIComponent(url.pathname).startsWith(decodeURIComponent(base.pathname))&&!uri.includes('..');}catch{return false;}
}
/** Cached local URI only; no network URLs or query-string document injection. */
export async function readTrackFile(uri:string,check:()=>void):Promise<TrackFile>{
 check();if(!isCacheUri(uri))throw new ExchangeError('INVALID');
 const info=await FileSystem.getInfoAsync(uri);check();if(!info.exists||info.isDirectory||!Number.isSafeInteger(info.size)||info.size<0||info.size>FILE_LIMIT)throw new ExchangeError('TOO_LARGE');
 const value=parseFileText(await FileSystem.readAsStringAsync(uri));check();
 if(value.kind==='distraction-request'&&await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,canonicalReference(value.reference))!==value.referenceDigest)throw new ExchangeError('INVALID');
 check();return value;
}
export async function shareTrackFile(input:TrackFile,check:()=>void){
 check();const value=parseFile(input);if(!FileSystem.cacheDirectory||!await Sharing.isAvailableAsync())throw new ExchangeError('UNAVAILABLE');check();
 const text=JSON.stringify(value);parseFileText(text);
 const directory=`${FileSystem.cacheDirectory}track-exchange/`;await FileSystem.makeDirectoryAsync(directory,{intermediates:true});check();
 // Android recipients may open their granted URI after the share sheet closes.
 // Retain fresh exports; remove only expired files from this dedicated cache.
 for(const name of await FileSystem.readDirectoryAsync(directory)){
  if(!/^(Verleitung|Faehrte)-[0-9a-f-]+\.anyvo-track$/.test(name))continue;
  const old=await FileSystem.getInfoAsync(directory+name);check();
  if(old.exists&&!old.isDirectory&&typeof old.modificationTime==='number'&&old.modificationTime*1000<Date.now()-86400000)await FileSystem.deleteAsync(directory+name,{idempotent:true});
 }
 const uri=`${directory}${value.kind==='distraction-return'?'Verleitung':'Faehrte'}-${Crypto.randomUUID()}.${FILE_EXTENSION}`;
 await FileSystem.writeAsStringAsync(uri,text);check();await Sharing.shareAsync(uri,{mimeType:MIME,UTI:'com.anyvo.track',dialogTitle:value.kind==='distraction-return'?'Verleitung zurückschicken':'Fährte teilen'});check();
}
