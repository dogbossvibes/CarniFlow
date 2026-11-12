/** Local backend contract. Not a production availability or release assertion. */
export type UUID = string;
export interface Receipt {
  version: 1; transferId: UUID; receiptId: UUID; recipientUserId: UUID;
  recipientDogId: UUID; ownSessionId: UUID; ownRunId: UUID;
  referenceDigest: string; acceptedAtMs: number;
}
export interface Envelope { version: 1; serverNowMs: number }
export interface Evaluation {
  legs: { name: string; score: number; max: number }[];
  score: number;
  /** Strict UTC ISO timestamp, YYYY-MM-DDTHH:mm:ss.sssZ. */
  evaluatedAt: string;
}
export interface RunPoint { lat: number; lng: number; t?: number; breakBefore?: boolean }
export interface OwnRun {
  run_id: UUID; session_id: UUID; started_at: string; ended_at: string;
  duration_seconds: number; score: number | null;
  average_deviation_meters: number | null; articles_found: number;
  total_objects: number; distance_meters: number; breaks: number;
  search_handler_distance_m: number | null; run_points: RunPoint[];
  continuity?: Record<string, unknown>; object_snapshot?: Record<string, unknown>;
  analytics?: Record<string, unknown>; object_detections?: unknown[];
  replay_points?: RunPoint[];
}
/** Reference is the existing strict TrackTransferReference, unchanged. */
export interface OwnCopy<Reference> {
  version: 1; revision: number; reference: Reference;
  /** Same order and exact length as reference.points/reference.markers. */
  pointIds: UUID[]; markerIds: UUID[]; createdAtMs: number;
  metadata: { title: string | null; notes: string | null; rating: number | null; lyingTimeMinutes: number | null };
  evaluation: Evaluation | null;
  run: OwnRun | null;
}
export interface RestoreResponse<Reference> extends Envelope {
  receipt: Receipt;
  quota: { success: true; used: number; limit: number };
  ownCopy: OwnCopy<Reference>;
}
export interface OwnPatch {
  title?: string | null; notes?: string | null; rating?: number | null;
  lyingTimeMinutes?: number | null; evaluation?: Evaluation; run?: OwnRun;
}
export interface SaveRequest { receiptId: UUID; operationId: UUID; expectedRevision: number; patch: OwnPatch }
export interface DeleteRequest { receiptId: UUID; operationId: UUID; expectedRevision: number }
/** Mutation ACK deliberately contains no hydration snapshot. */
export interface MutationResponse extends Envelope {
  receiptId: UUID; operationId: UUID; appliedRevision: number;
  currentRevision: number; deleted: boolean;
}
export interface ListOwnResponse extends Envelope {
  owned: { receipt: Receipt; revision: number; deleted: boolean }[];
}
export interface OwnActions<Reference> {
  restore: { request: { receiptId: UUID }; response: RestoreResponse<Reference> };
  receipt: { request: { receiptId: UUID }; response: RestoreResponse<Reference> };
  save_own: { request: SaveRequest; response: MutationResponse };
  delete_own: { request: DeleteRequest; response: MutationResponse };
  /** UUID ascending, <=50 rows. Continue with last receiptId until <50 rows. */
  list_own: { request: { afterReceiptId: UUID | null }; response: ListOwnResponse };
}
