import { parseDistractionTrack } from '@/features/tracking-distractions/model';
import { assert,finite,uuid,parseReference,parseFile,type ExchangeReference,type TrackReturn } from '../contract';
import { type createGroupRpcClient } from './groupRpc';
export interface GroupTask {taskId:string;groupId:string;creatorUserId:string;recipientUserId:string;sourceTrainingId:string;sourceRevision:string;referenceDigest:string;createdAtMs:number;expiresAtMs:number;acceptedAtMs:number|null}
export interface Submission {submissionId:string;authorUserId:string;contribution:TrackReturn['contribution'];decision:null|'accepted'|'changes_requested';createdAtMs:number;reviewedAtMs:number|null}
export interface TaskDetail {task:GroupTask;reference:ExchangeReference|null;submissions:Submission[]}
const object=(v:unknown)=>{assert(v&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;};
const digest=(v:unknown)=>{assert(typeof v==='string'&&/^[a-f0-9]{64}$/.test(v));return v;};
const time=(v:unknown)=>{const n=finite(v,1,8640000000000000);assert(Number.isSafeInteger(n));return n;};
function meta(v:unknown):GroupTask {const r=object(v);assert(typeof r.sourceRevision==='string'&&r.sourceRevision.length>0&&r.sourceRevision.length<=256);
 const task={taskId:uuid(r.taskId),groupId:uuid(r.groupId),creatorUserId:uuid(r.creatorUserId),recipientUserId:uuid(r.recipientUserId),sourceTrainingId:uuid(r.sourceTrainingId),sourceRevision:r.sourceRevision,referenceDigest:digest(r.referenceDigest),createdAtMs:time(r.createdAtMs),expiresAtMs:time(r.expiresAtMs),acceptedAtMs:r.acceptedAtMs===null?null:time(r.acceptedAtMs)};
 assert(task.creatorUserId!==task.recipientUserId&&task.expiresAtMs>task.createdAtMs);return task;
}
export function parseTaskDetail(value:unknown,userId:string,taskId:string):TaskDetail {
 const r=object(value),task=meta(r.task);assert(task.taskId===taskId&&(task.creatorUserId===userId||task.recipientUserId===userId));
 const reference=r.reference===null?null:parseReference(r.reference);assert(Array.isArray(r.submissions)&&r.submissions.length<=32);
 if(userId===task.recipientUserId&&task.acceptedAtMs===null)assert(reference===null&&r.submissions.length===0);
 else assert(reference!==null);
 const submissions=r.submissions.map(raw=>{const s=object(raw);assert(s.decision===null||s.decision==='accepted'||s.decision==='changes_requested');const authorUserId=uuid(s.authorUserId);assert(authorUserId===task.recipientUserId);
  const f=parseFile({format:'anyvo-track',version:1,kind:'distraction-return',taskId,referenceDigest:task.referenceDigest,contribution:s.contribution}) as TrackReturn;
  return {submissionId:uuid(s.submissionId),authorUserId,contribution:f.contribution,decision:s.decision as Submission['decision'],createdAtMs:time(s.createdAtMs),reviewedAtMs:s.reviewedAtMs===null?null:time(s.reviewedAtMs)};});
 assert(new Set(submissions.map(s=>s.submissionId)).size===submissions.length);return {task,reference,submissions};
}
export function groupTaskService(client:ReturnType<typeof createGroupRpcClient>,userId:string){
 const call=(action:string,request:Record<string,unknown>)=>client.call(userId,'training_group_distraction_v1',action,request);
 const detail=async(action:string,request:Record<string,unknown>)=>parseTaskDetail(await call(action,request),userId,String(request.taskId));
 return {
  async list(groupId:string){const r=await call('list',{groupId});assert(Array.isArray(r.tasks)&&r.tasks.length<=1000);return r.tasks.map(meta).filter(task=>{assert(task.groupId===groupId&&(task.creatorUserId===userId||task.recipientUserId===userId));return true;});},
  async prepare(sourceTrainingId:string){const r=await call('prepare',{sourceTrainingId});assert(r.sourceTrainingId===sourceTrainingId&&typeof r.sourceRevision==='string');return {sourceTrainingId,sourceRevision:r.sourceRevision,referenceDigest:digest(r.referenceDigest),reference:parseReference(r.reference)};},
  async create(taskId:string,groupId:string,recipientUserId:string,source:{sourceTrainingId:string;sourceRevision:string;referenceDigest:string}){const d=await detail('create',{taskId,groupId,recipientUserId,sourceTrainingId:source.sourceTrainingId,sourceRevision:source.sourceRevision,referenceDigest:source.referenceDigest,ttlSeconds:604800});assert(d.task.creatorUserId===userId&&d.task.groupId===groupId&&d.task.recipientUserId===recipientUserId&&d.task.sourceTrainingId===source.sourceTrainingId&&d.task.sourceRevision===source.sourceRevision&&d.task.referenceDigest===source.referenceDigest);return d;},
  get:(taskId:string)=>detail('get',{taskId}),async accept(taskId:string){const d=await detail('accept',{taskId});assert(d.task.recipientUserId===userId&&d.task.acceptedAtMs!==null);return d;},
  async submit(taskId:string,submissionId:string,referenceDigest:string,contribution:TrackReturn['contribution']){const d=await detail('submit',{taskId,submissionId,referenceDigest,contribution});const row=d.submissions.find(s=>s.submissionId===submissionId);assert(d.task.referenceDigest===referenceDigest&&row&&row.authorUserId===userId&&JSON.stringify(row.contribution)===JSON.stringify(parseDistractionTrack(contribution)));return d;},
  async review(taskId:string,submissionId:string,decision:'accepted'|'changes_requested'){const d=await detail('review',{taskId,submissionId,decision});assert(d.task.creatorUserId===userId&&d.submissions.some(s=>s.submissionId===submissionId&&s.decision===decision));return d;},
  async revoke(taskId:string){const r=await call('revoke',{taskId});assert(r.taskId===taskId&&r.revoked===true);},
 };
}
