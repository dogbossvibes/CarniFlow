export interface RestingActivityStartInput {
  dogId: string;
  sessionId: string;
  dogName: string;
  /** Fachlicher Beginn der Liegezeit (ms seit Epoch) — persistierter Zeitstempel, nie „jetzt". */
  lyingStartedAtMs: number;
  lyingLabel: string;
  sinceLabel: string;
  deepLinkUrl: string;
}

export interface RestingActivityInfo {
  activityId: string;
  dogId: string;
  sessionId: string;
  lyingStartedAtMs: number;
}
