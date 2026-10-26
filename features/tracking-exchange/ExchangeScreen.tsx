import { takePendingTrackFile } from './pending';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect,useLocalSearchParams,useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { useDistractions } from '@/features/tracking-distractions/useDistractions';
import { distractionRepository } from '@/features/tracking-distractions/repository';
import { distractionDistance } from '@/features/tracking-distractions/model';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { getTrackHistory } from '@/features/tracking/services/trackHistoryService';
import type { TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import { getUserAccess } from '@/lib/entitlements/getUserAccess';
import { exchangeRepository,type ExchangeRow } from './repository';
import { ExchangeError,type TrackFile,type TrackOffer,displayReference } from './contract';
import { readExchangeSource } from './source';
import { importTrackFile,shareTrackFile } from './files';
import { exchangeErrorKey } from './i18n';
export function ExchangeButton({label,onPress,disabled=false}:{label:string;onPress():void;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} style={[styles.button,disabled&&{opacity:0.45}]} onPress={onPress}><Text style={styles.action}>{label}</Text></Pressable>;}
export default function ExchangeScreen(){const data=useDistractions(undefined);return <Content key={`${data.userId}:${data.epoch}`} data={data}/>;}
function Content({data}:{data:ReturnType<typeof useDistractions>}){
 const {t}=useTranslation('trackExchange'),router=useRouter(),params=useLocalSearchParams<{sourceId?:string;taskId?:string;incoming?:string;importNotice?:string;mode?:string}>();
 const [sourceId,setSourceId]=useState(typeof params.sourceId==='string'?params.sourceId:''),[title,setTitle]=useState('');
 const [rows,setRows]=useState<ExchangeRow[]>([]),[history,setHistory]=useState<TrackHistoryRow[]>([]),[preview,setPreview]=useState<TrackFile|null>(null);
 const [selected,setSelected]=useState<string|null>(typeof params.taskId==='string'?params.taskId:null),[error,setError]=useState<unknown>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [children,setChildren]=useState<{id:string;name:string;distance:number}[]>([]);
 const alive=useRef(true),lock=useRef(false),generation=useRef(0),captured=useRef({...data.scope.current});
 const check=useCallback(()=>{const s=data.scope.current;if(!alive.current||s.userId!==captured.current.userId||s.epoch!==captured.current.epoch)throw new ExchangeError('ACCOUNT_CHANGED');},[data.scope]);
 const repo=useMemo(()=>data.userId?exchangeRepository(data.userId,()=>data.scope.current):null,[data.userId,data.scope]);
 const load=useCallback(async()=>{const token=++generation.current;if(!repo||!data.userId)return;try{const list=await repo.list();check();if(token!==generation.current)return;if(typeof params.taskId==='string'&&!list.some(row=>row.taskId===params.taskId)){const requested=await repo.get(params.taskId);check();if(token!==generation.current)return;if(!requested)throw new ExchangeError('NOT_FOUND');list.unshift(requested);}setRows(list);}catch(e){if(alive.current&&token===generation.current)setError(e);}},[repo,data.userId,check,params.taskId]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(typeof params.incoming==='string'&&data.userId){try{check();setPreview(takePendingTrackFile(params.incoming,data.userId));}catch(e){setError(e);}}},[params.incoming,data.userId,check]);
 useFocusEffect(useCallback(()=>{void load();return()=>{generation.current++;};},[load]));
 const task=rows.find(r=>r.taskId===selected);
 useEffect(()=>{let valid=true;setChildren([]);if(task?.role==='incoming'&&data.userId){void distractionRepository(data.userId,()=>data.scope.current).list(task.parentId).then(list=>{check();if(valid)setChildren(list.filter(r=>r.track.finishedAtMs!==null).map(r=>({id:r.track.id,name:r.track.name,distance:distractionDistance(r.track.points)})));}).catch(e=>{if(valid&&alive.current)setError(e);});}return()=>{valid=false;};},[task,data.userId,data.scope,check]);
 async function act(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError(null);setMessage('');try{check();await fn();check();}catch(e){if(alive.current)setError(e);}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function chooseSource(){if(!data.userId)throw new ExchangeError('ACCOUNT_CHANGED');const list=await getTrackHistory(data.userId);check();setHistory(list.filter(r=>r.status==='completed'));}
 async function prepare(){if(!repo||!data.userId)throw new ExchangeError('ACCOUNT_CHANGED');if(!sourceId){await chooseSource();return;}const access=await getUserAccess(data.userId);check();if(!access.hasActiveAccess)throw new ExchangeError('ACTIVE_REQUIRED');
  const reference=await readExchangeSource(sourceId,data.userId,check);check();const row=await repo.create(sourceId,title.trim()||t('defaultTitle'),reference);check();setPreview(row.offer);await load();}
 async function importConfirm(){if(!preview||!repo||!data.userId)return;if(preview.kind==='distraction-request'){const row=await repo.accept(preview);check();setSelected(row.taskId);setPreview(null);await load();}
  else {const old=await repo.get(preview.taskId);check();if(!old||old.role!=='outgoing')throw new ExchangeError('NOT_FOUND');const source=await readExchangeSource(old.parentId,data.userId,check);const result=await repo.applyReturn(preview,source);check();setPreview(null);setSelected(old.taskId);setMessage(t(result.duplicate?'duplicate':'done'));await load();}}
 const reference=preview?.kind==='distraction-request'?preview.reference:preview?.kind==='distraction-return'?rows.find(r=>r.taskId===preview.taskId)?.offer.reference:task?.offer.reference;
 const map=reference?displayReference(reference,'preview','preview').map:null;
 const returning=preview?.kind==='distraction-return'?preview.contribution:undefined;
 const button=(label:string,fn:()=>Promise<void>)=><ExchangeButton label={label} disabled={busy} onPress={()=>void act(fn)}/>;
 return <SafeAreaView style={styles.safe}><ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <ExchangeButton label={t('back')} disabled={busy} onPress={()=>{if(preview){setPreview(null);setMessage('');}else if(selected&&params.mode){setSelected(null);setMessage('');}else if(router.canGoBack())router.back();else router.replace('/track/sharing' as never);}}/>
  {params.importNotice&&<Text style={styles.body}>{t('importHint')}</Text>}<Text accessibilityRole="header" style={styles.title}>{t(task?task.role==='incoming'?'received':'outgoing':params.mode==='compose'?'file':'import')}</Text>
  {busy&&<ActivityIndicator accessibilityLabel={t('loading')} color={C.accent}/>}{!!error&&<Text accessibilityRole="alert" style={styles.error}>{t(exchangeErrorKey(error))}</Text>}{!!message&&<Text accessibilityRole="alert" style={styles.body}>{message}</Text>}
  {preview||task?<>
   <Text style={styles.heading}>{preview?.kind==='distraction-return'?t('review'):task?.offer.title??(preview as TrackOffer)?.title}</Text>
   {map&&<View style={styles.map}><TrackingMap currentPosition={null} layPoints={map.lay} markers={map.markers} startAnchor={map.start} endPoint={map.end} follow={false} fitToPoints={[...map.lay,...(returning?.points??[])]} distractionTracks={returning?[returning]:[]}/></View>}
   {reference&&<Text style={styles.body}>{t('distance')}: {reference.distanceM===null?t('unknown'):`${Math.round(reference.distanceM)} m`}</Text>}
   {preview?<><Text style={styles.body}>{t('unverified')}</Text>{preview.kind==='distraction-request'&&rows.some(r=>r.taskId===preview.taskId&&r.role==='outgoing')?<><Text style={styles.body}>{t('privacy')}</Text>{button(t('send'),async()=>{await shareTrackFile(preview,check);setMessage(t('prepared'));})}</>:button(t(preview.kind==='distraction-request'?'accept':'add'),importConfirm)}<ExchangeButton label={t('cancel')} disabled={busy} onPress={()=>setPreview(null)}/></>:
    task?.role==='incoming'?<><Text style={styles.body}>{t('incoming')}</Text><ExchangeButton label={t('record')} disabled={busy} onPress={()=>router.push({pathname:'/track/verleitungen',params:{id:task.parentId}} as never)}/><Text style={styles.heading}>{t('finished')}</Text>{!children.length&&<Text style={styles.body}>{t('noneFinished')}</Text>}{children.map(child=><View key={child.id} style={styles.card}><Text style={styles.heading}>{child.name} · {Math.round(child.distance)} m</Text>{button(t('return'),async()=>{if(!repo)return;const file=await repo.makeReturn(task.taskId,child.id);check();await shareTrackFile(file,check);setMessage(t('prepared'));})}</View>)}</>:
    task&&<><Text style={styles.body}>{t('outgoing')}</Text><Text style={styles.body}>{t('privacy')}</Text>{button(t('send'),async()=>{await shareTrackFile(task.offer,check);setMessage(t('prepared'));})}<ExchangeButton label={t('open')} disabled={busy} onPress={()=>router.push({pathname:'/track/verleitungen',params:{id:task.parentId}} as never)}/></>}
  </>:selected?<View style={styles.card}><Text style={styles.body}>{t('notFound')}</Text>{button(t('refresh'),load)}</View>:<>
   {params.mode!=='compose'&&<View style={styles.card}><Text style={styles.heading}>{t('import')}</Text><Text style={styles.body}>{t('importHint')}</Text>{button(t('import'),async()=>{const file=await importTrackFile(check);check();if(file?.kind==='distraction-return'){const original=await repo?.get(file.taskId);check();if(!original||original.role!=='outgoing')throw new ExchangeError('NOT_FOUND');if(original.offer.referenceDigest!==file.referenceDigest)throw new ExchangeError('CONFLICT');setRows(previous=>[original,...previous.filter(r=>r.taskId!==original.taskId)]);}if(file)setPreview(file);})}</View>}
   {params.mode==='compose'&&<View style={styles.card}><Text style={styles.heading}>{t('file')}</Text><Text style={styles.body}>{t('fileHint')}</Text><TextInput accessibilityLabel={t('name')} placeholder={t('name')} placeholderTextColor={C.trackTextMut} value={title} onChangeText={setTitle} maxLength={80} style={styles.input}/>{sourceId&&<Text style={styles.body}>{t('source')} ✓</Text>}{button(t(sourceId?'preview':'source'),prepare)}
    {history.map(row=><ExchangeButton key={row.id} label={`${row.session_date??'—'} · ${row.distance_meters==null?'—':Math.round(row.distance_meters)} m`} disabled={busy} onPress={()=>{setSourceId(row.id);setHistory([]);}}/>)}</View>}

  </>}
 </ScrollView></SafeAreaView>;
}
export const styles=StyleSheet.create({safe:{flex:1,backgroundColor:C.bg},content:{padding:20,paddingBottom:48,gap:16},title:{fontSize:26,color:C.trackText,fontWeight:'800'},heading:{fontSize:18,color:C.trackText,fontWeight:'700'},body:{color:C.trackTextSec,fontSize:15,lineHeight:22},error:{color:'#FFB4A9',fontSize:15,lineHeight:22},card:{padding:18,gap:12,borderRadius:20,backgroundColor:C.card,borderWidth:1,borderColor:C.border},button:{minHeight:48,padding:14,justifyContent:'center',borderRadius:14,borderWidth:1,borderColor:C.border},action:{color:C.accent,fontSize:16,fontWeight:'700'},input:{minHeight:48,borderWidth:1,borderColor:C.border,borderRadius:12,padding:12,color:C.trackText},map:{height:320,borderRadius:18,overflow:'hidden'}});
