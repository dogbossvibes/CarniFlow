import { getLocalDb } from '@/lib/localDb/client';
import { newLocalId, nowIso } from '@/lib/localDb/ids';
import type { LocalMediaFile, MediaFileType } from '@/features/sync/types/sync';

export interface NewLocalMediaFile {
  sessionLocalId?: string | null;
  fileType: MediaFileType;
  localUri: string;
  mimeType?: string | null;
  fileSize?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, any>;
}

export async function createLocalMediaFile(input: NewLocalMediaFile): Promise<LocalMediaFile> {
  const db = await getLocalDb();
  const id = newLocalId('media');
  const ts = nowIso();
  await db.runAsync(
    `insert into local_media_files (local_id, remote_id, session_local_id, session_remote_id, file_type, local_uri, remote_url, mime_type, file_size, duration_seconds, width, height, created_at, sync_status, upload_attempts, last_upload_error, metadata_json)
     values (?, null, ?, null, ?, ?, null, ?, ?, ?, ?, ?, ?, 'pending', 0, null, ?)`,
    id, input.sessionLocalId ?? null, input.fileType, input.localUri, input.mimeType ?? null,
    input.fileSize ?? null, input.durationSeconds ?? null, input.width ?? null, input.height ?? null, ts,
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
  return (await db.getFirstAsync<LocalMediaFile>(`select * from local_media_files where local_id=?`, id))!;
}

export async function getPendingMediaFiles(limit = 20): Promise<LocalMediaFile[]> {
  const db = await getLocalDb();
  return db.getAllAsync<LocalMediaFile>(`select * from local_media_files where sync_status!='synced' order by created_at asc limit ?`, limit);
}

export async function markMediaUploaded(localId: string, remoteUrl: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update local_media_files set remote_url=?, sync_status='synced' where local_id=?`, remoteUrl, localId);
}

export async function markMediaUploadFailed(localId: string, error: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update local_media_files set sync_status='failed', upload_attempts=upload_attempts+1, last_upload_error=? where local_id=?`, error.slice(0, 500), localId);
}

export async function deleteLocalMediaFile(localId: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`delete from local_media_files where local_id=?`, localId);
}
