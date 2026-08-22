// ──────────────────────────────────────────────────────────────────────────
// ADAPTIVE CORNER CONFIRMATION (Confidence-Engine Phase 2).
//
// Baut auf der bestehenden Confidence-Engine (autoCornerDetection.ts) auf und
// erzeugt KEINE zweite Geometrie-/Corner-Detection. Sie schiebt zwischen
// „Kandidat akzeptiert" und „Winkel persistieren" eine kleine, evidenzbasierte
// State-Machine:
//
//   candidate → (HIGH)            → confirmed        (sofort, keine Verzögerung)
//   candidate → confirming        → confirmed        (MEDIUM: kurze geometrische Bestätigung)
//   candidate → confirming        → rejected/expired (Bearing kippt zurück / kein Beleg)
//
// Bestätigung ist NICHT primär zeitbasiert, sondern distanz-/sample-/bearingbasiert
// (Menschen laufen unterschiedlich schnell). Zeit dient nur als Sicherheits-Backstop.
//
// Die Confidence eines Kandidaten DARF sich mit neuen Folgepunkten entwickeln
// (steigt bei stabiler Fortführung, fällt bei Rücksprung) — die Aktualisierung
// kommt ausschließlich aus neu klassifizierter Geometrie, nie aus verstrichener Zeit.
// ──────────────────────────────────────────────────────────────────────────

import {
  classifyCornerCandidate, evaluateBestCorner,
  type AutoCornerPoint, type CandidateState, type ConfidenceLevel,
  type CornerCandidate, type CornerFactors, type CornerKind,
} from '@/features/tracking/utils/autoCornerDetection';

// ── Konfiguration (Werte an der bestehenden Sampling-/Geometrie-Logik verankert) ──
export interface ConfirmConfig {
  confirmSamples:      number;   // akzeptierte Folgepunkte auf dem neuen Schenkel (≥2 → echte Fortführung, kein Einzelsprung; MIN_STEP_M=2 → ~4 m)
  confirmOutboundM:    number;   // ODER so viel neuer Schenkel (=STRAIGHT_WINDOW_M=8 → eine volle Geradheits-Fensterlänge belegt)
  bearingStableMin:    number;   // straightAfter-Untergrenze für „stabil weitergeführt" (=STRAIGHT_ACCEPT=0.70)
  rejectConfidence:    number;   // fällt die Confidence darunter → reject (=REJECT_CONF=0.42)
  rejectStraightAfter: number;   // knickt der neue Schenkel darunter → Rücksprung/Kurve → reject (=STRAIGHT_REJECT=0.45)
  mediumConfidence:    number;   // Untergrenze „medium" (=CONF_MEDIUM=0.60), u. a. für die Flush-Rettung
  maxMisses:           number;   // so viele aufeinanderfolgende Nicht-accept-Beobachtungen werden als transienter GPS-Aussetzer toleriert
  identityTolM:        number;   // derselbe physische Scheitel, wenn Along-Track-Distanz ≤ diesem Wert (=CORNER_GAP_M=4)
  maxOutboundM:        number;   // Backstop: so langer stabiler Schenkel und trotzdem nie „confirm" → expire (3×Fenster)
  expiryMs:            number;   // Backstop (NUR Zeit, nicht primär): so lange ohne Abschluss → expire
  classHysteresisVotes: number;  // Umklassifizierung (normal↔spitz / links↔rechts) erst nach so vielen konsistenten Gegenbeobachtungen
  rescueMinOutboundM:  number;   // Flush am Track-Ende: Mindest-Schenkel für die Rettung eines noch nicht bestätigten Winkels (=LEG_MIN_M=4)
  // GPS-Quality-Kopplung (Phase 3): degradiertes/schlechtes Signal verlangt MEHR
  // Bestätigungs-Evidenz, verwirft aber NIE allein wegen globaler Qualität.
  qualityDegradedExtraSamples:   number;   // +Samples bei 'degraded'
  qualityDegradedExtraOutboundM: number;   // +Meter neuer Schenkel bei 'degraded'
  qualityPoorExtraSamples:       number;   // +Samples bei 'poor'
  qualityPoorExtraOutboundM:     number;   // +Meter neuer Schenkel bei 'poor'
  qualityDegradedMissBonus:      number;   // +tolerierte Misses bei 'degraded' (längere Schlecht-Phase am Scheitel)
  qualityPoorMissBonus:          number;   // +tolerierte Misses bei 'poor'
}

export const DEFAULT_CONFIRM_CONFIG: ConfirmConfig = {
  confirmSamples:       2,
  confirmOutboundM:     8,
  bearingStableMin:     0.70,
  rejectConfidence:     0.42,
  rejectStraightAfter:  0.45,
  mediumConfidence:     0.60,
  maxMisses:            2,
  identityTolM:         4,
  maxOutboundM:         24,
  expiryMs:             20_000,
  classHysteresisVotes: 2,
  rescueMinOutboundM:   4,
  qualityDegradedExtraSamples:   1,   // good 2/8 → degraded 3/11
  qualityDegradedExtraOutboundM: 3,
  qualityPoorExtraSamples:       2,   // good 2/8 → poor 4/14
  qualityPoorExtraOutboundM:     6,
  qualityDegradedMissBonus:      1,
  qualityPoorMissBonus:          2,
};

// GPS-Qualitäts-Level (Kontext aus der GPS Quality Engine). `undefined` = neutral
// (Warmup/kein Signal) → exakt bisheriges Verhalten.
export type ConfirmQuality = 'excellent' | 'good' | 'degraded' | 'poor';

interface QualityRequirement {
  samples:       number;   // benötigte Folge-Samples (MEDIUM)
  outboundM:     number;   // ODER so viel neuer Schenkel (MEDIUM)
  missBonus:     number;   // zusätzlich tolerierte Misses
  immediateHigh: boolean;  // HIGH sofort bestätigen (nur bei gutem Signal)
  highMinSamples: number;  // HIGH unter 'degraded': so viele Folge-Samples vor Confirm
}

function requirementFor(cfg: ConfirmConfig, q: ConfirmQuality | undefined): QualityRequirement {
  switch (q) {
    case 'poor':
      return {
        samples: cfg.confirmSamples + cfg.qualityPoorExtraSamples,
        outboundM: cfg.confirmOutboundM + cfg.qualityPoorExtraOutboundM,
        missBonus: cfg.qualityPoorMissBonus,
        immediateHigh: false,   // keine blinde Sofort-Persistenz bei poor
        highMinSamples: cfg.confirmSamples + cfg.qualityPoorExtraSamples,
      };
    case 'degraded':
      return {
        samples: cfg.confirmSamples + cfg.qualityDegradedExtraSamples,
        outboundM: cfg.confirmOutboundM + cfg.qualityDegradedExtraOutboundM,
        missBonus: cfg.qualityDegradedMissBonus,
        immediateHigh: false,   // minimal zusätzliche Bestätigung
        highMinSamples: 1,
      };
    default:   // 'good' | 'excellent' | undefined → unverändert
      return {
        samples: cfg.confirmSamples,
        outboundM: cfg.confirmOutboundM,
        missBonus: 0,
        immediateHigh: true,
        highMinSamples: 0,
      };
  }
}

// Beobachtung eines Fixes: der aktuell für DENSELBEN Scheitel neu klassifizierte
// Kandidat (bzw. bei Neuentdeckung der beste Kandidat aus evaluateBestCorner) plus
// die Along-Track-Position des letzten Punktes. state/level/factors kommen unverändert
// aus der bestehenden Engine — KEINE zweite Geometrieberechnung hier.
export interface CornerObservation {
  apexCumDist:   number;
  apexLat:       number;
  apexLng:       number;
  latestCumDist: number;
  state:         CandidateState;
  confidence:    number;
  level:         ConfidenceLevel;
  kind:          CornerKind | null;
  angleDeg:      number;
  factors:       CornerFactors;
  accuracyM:     number | null;
  tMs:           number;         // nur Expiry-Backstop
}

export type ConfirmEventType =
  | 'created' | 'evidence' | 'updated' | 'reclassified'
  | 'confirmed' | 'rejected' | 'expired';

// Payload eines FINAL bestätigten Winkels → an die bestehende Persistenz-/Guidance-
// Pipeline (Marker/Voice/Logbuch). Enthält zugleich die Outdoor-QA-Metriken.
export interface ConfirmedCorner {
  kind:              CornerKind;
  angleDeg:          number;
  apexCumDist:       number;
  apexLat:           number;
  apexLng:           number;
  accuracyM:         number | null;
  initialConfidence: number;
  finalConfidence:   number;
  finalLevel:        ConfidenceLevel;
  confirmDistanceM:  number;
  confirmSamples:    number;
  reason:            string;
}

export interface ConfirmEvent {
  type:       ConfirmEventType;
  kind:       CornerKind | null;
  confidence: number;
  level:      ConfidenceLevel;
  detail:     string;
  corner?:    ConfirmedCorner;   // nur bei 'confirmed'
}

interface Active {
  apexCumDist:         number;
  apexLat:             number;
  apexLng:             number;
  kind:                CornerKind;
  direction:           'links' | 'rechts';
  band:                'normal' | 'spitz';
  initialConfidence:   number;
  bestConfidence:      number;
  latestConfidence:    number;
  latestLevel:         ConfidenceLevel;
  latestStraightAfter: number;
  angleDeg:            number;
  accuracyM:           number | null;
  startCumDist:        number;   // latestCumDist bei Erzeugung
  confirmDistanceM:    number;   // latestCumDist − apexCumDist (neuer Schenkel)
  followSamples:       number;   // akzeptierte Folgepunkte NACH der Erzeugung
  misses:              number;
  everAccept:          boolean;
  createdAtMs:         number;
  pendingKind:         CornerKind | null;   // Hysterese-Puffer für Umklassifizierung
  pendingVotes:        number;
}

export interface CornerConfirmer {
  observe(obs: CornerObservation | null, quality?: ConfirmQuality): ConfirmEvent[];
  flush(nowMs: number): ConfirmEvent[];
  reset(): void;
  peek(): { apexCumDist: number; kind: CornerKind } | null;
}

function bandOfKind(kind: CornerKind): 'normal' | 'spitz' {
  return kind === 'spitz_links' || kind === 'spitz_rechts' ? 'spitz' : 'normal';
}
function dirOfKind(kind: CornerKind): 'links' | 'rechts' {
  return kind === 'links' || kind === 'spitz_links' ? 'links' : 'rechts';
}

export function createCornerConfirmer(config: ConfirmConfig = DEFAULT_CONFIRM_CONFIG): CornerConfirmer {
  const cfg = config;
  let active: Active | null = null;

  function mk(type: ConfirmEventType, a: Active, detail: string): ConfirmEvent {
    return { type, kind: a.kind, confidence: a.latestConfidence, level: a.latestLevel, detail };
  }

  function finalize(a: Active, type: ConfirmEventType, reason: string): ConfirmEvent {
    const ev = mk(type, a, reason);
    if (type === 'confirmed') {
      ev.corner = {
        kind: a.kind, angleDeg: a.angleDeg, apexCumDist: a.apexCumDist,
        apexLat: a.apexLat, apexLng: a.apexLng, accuracyM: a.accuracyM,
        initialConfidence: a.initialConfidence, finalConfidence: a.latestConfidence,
        finalLevel: a.latestLevel, confirmDistanceM: a.confirmDistanceM,
        confirmSamples: a.followSamples, reason,
      };
    }
    return ev;
  }

  function startNew(obs: CornerObservation, events: ConfirmEvent[], req: QualityRequirement, q: ConfirmQuality | undefined): void {
    // obs.kind ist hier garantiert gesetzt (nur bei accept aufgerufen).
    const kind = obs.kind as CornerKind;
    active = {
      apexCumDist: obs.apexCumDist, apexLat: obs.apexLat, apexLng: obs.apexLng,
      kind, direction: dirOfKind(kind), band: bandOfKind(kind),
      initialConfidence: obs.confidence, bestConfidence: obs.confidence,
      latestConfidence: obs.confidence, latestLevel: obs.level,
      latestStraightAfter: obs.factors.straightAfter, angleDeg: obs.angleDeg,
      accuracyM: obs.accuracyM, startCumDist: obs.latestCumDist,
      confirmDistanceM: obs.latestCumDist - obs.apexCumDist,
      followSamples: 0, misses: 0, everAccept: true, createdAtMs: obs.tMs,
      pendingKind: null, pendingVotes: 0,
    };
    // HIGH + geometrischer Accept → sofort bestätigen, ABER nur bei gutem Signal
    // (Section 12: bei degraded/poor Bestätigung verlangen statt blinder Persistenz).
    if (obs.level === 'high' && req.immediateHigh) {
      events.push(finalize(active, 'confirmed', 'high_immediate'));
      active = null;
    } else {
      const qtag = q && q !== 'good' && q !== 'excellent' ? ` quality=${q}` : '';
      events.push(mk('created', active, `${kind} ${obs.confidence.toFixed(2)} ${obs.level}${qtag}`));
    }
  }

  function maybeReclassify(a: Active, obs: CornerObservation, events: ConfirmEvent[]): void {
    const kind = obs.kind as CornerKind;
    if (kind === a.kind) { a.pendingKind = null; a.pendingVotes = 0; return; }
    // Gegenbeobachtung sammeln — erst nach genug konsistenten Stimmen umklassifizieren
    // (verhindert wildes normal↔spitz / links↔rechts durch GPS-Jitter, Section 9).
    if (kind === a.pendingKind) a.pendingVotes += 1;
    else { a.pendingKind = kind; a.pendingVotes = 1; }
    if (a.pendingVotes >= cfg.classHysteresisVotes) {
      const from = a.kind;
      a.kind = kind; a.direction = dirOfKind(kind); a.band = bandOfKind(kind);
      a.pendingKind = null; a.pendingVotes = 0;
      events.push(mk('reclassified', a, `${from}→${kind}`));
    }
  }

  function observe(obs: CornerObservation | null, quality?: ConfirmQuality): ConfirmEvent[] {
    const events: ConfirmEvent[] = [];
    const req = requirementFor(cfg, quality);

    // Zeit-Backstop (nur Sicherheit, nicht primär).
    if (active && obs && obs.tMs - active.createdAtMs > cfg.expiryMs) {
      events.push(finalize(active, 'expired', 'time_backstop'));
      active = null;
    }

    const accept = !!obs && obs.state === 'accept' && obs.kind != null;

    if (!active) {
      if (obs && accept) startNew(obs, events, req, quality);
      return events;
    }

    // Nicht-accept-Beobachtung → Miss (transienter GPS-Aussetzer) oder echter Rücksprung.
    // Bei degraded/poor Signal wird eine längere Schlecht-Phase am Scheitel toleriert.
    if (!obs || !accept) {
      const maxMisses = cfg.maxMisses + req.missBonus;
      active.misses += 1;
      if (obs) active.latestConfidence = obs.confidence;
      const hardReversal = !!obs && obs.state === 'reject' && obs.factors.straightAfter < cfg.rejectStraightAfter;
      if (hardReversal || active.misses > maxMisses) {
        events.push(finalize(active, 'rejected', hardReversal ? 'bearing_reversed' : 'lost_candidate'));
        active = null;
      } else {
        events.push(mk('updated', active, `miss ${active.misses}/${maxMisses}${quality && quality !== 'good' && quality !== 'excellent' ? ` quality=${quality}` : ''}`));
      }
      return events;
    }

    // Accept-Beobachtung desselben Scheitels → Evidenz fortschreiben.
    const o = obs as CornerObservation;
    active.misses = 0;
    active.everAccept = true;
    active.followSamples += 1;
    active.confirmDistanceM = o.latestCumDist - active.apexCumDist;
    active.latestConfidence = o.confidence;
    active.latestLevel = o.level;
    active.latestStraightAfter = o.factors.straightAfter;
    active.accuracyM = o.accuracyM;
    active.angleDeg = o.angleDeg;
    if (o.confidence > active.bestConfidence) active.bestConfidence = o.confidence;
    maybeReclassify(active, o, events);

    // Confidence hat sich zu HIGH entwickelt → bei gutem Signal sofort bestätigen.
    if (o.level === 'high' && req.immediateHigh) {
      events.push(finalize(active, 'confirmed', 'evidence_upgrade'));
      active = null;
      return events;
    }
    // Confidence eingebrochen bzw. Schenkel knickt zurück → verwerfen (NICHT wegen GPS-Qualität).
    if (o.confidence < cfg.rejectConfidence || o.factors.straightAfter < cfg.rejectStraightAfter) {
      events.push(finalize(active, 'rejected', 'confidence_collapsed'));
      active = null;
      return events;
    }
    // Bestätigung über Bearing-Stabilität UND (genug Samples ODER genug Distanz).
    // HIGH unter degraded braucht nur eine minimale zusätzliche Bestätigung (highMinSamples);
    // MEDIUM (und HIGH unter poor) die volle qualitätsabhängige Anforderung.
    const bearingStable = o.factors.straightAfter >= cfg.bearingStableMin;
    const isHigh = o.level === 'high';
    const needSamples = isHigh && quality === 'degraded' ? req.highMinSamples : req.samples;
    const needOutbound = isHigh && quality === 'degraded' ? 0 : req.outboundM;
    const bySamples = active.followSamples >= needSamples;
    const byDistance = needOutbound > 0 && active.confirmDistanceM >= needOutbound;
    if (bearingStable && (bySamples || byDistance)) {
      const why = bySamples ? 'evidence_samples' : 'evidence_distance';
      const qtag = quality && quality !== 'good' && quality !== 'excellent' ? ` quality=${quality} req=${needSamples}/${needOutbound}m` : '';
      events.push(finalize(active, 'confirmed', `${why}${qtag}`));
      active = null;
      return events;
    }
    // Backstop: sehr langer Schenkel, aber nie bestätigt → expire.
    if (active.confirmDistanceM > cfg.maxOutboundM) {
      events.push(finalize(active, 'expired', 'max_outbound'));
      active = null;
      return events;
    }
    events.push(mk('evidence', active, `+${active.confirmDistanceM.toFixed(1)}m s=${active.followSamples} bearing=${bearingStable ? 'stable' : 'weak'}`));
    return events;
  }

  function flush(nowMs: number): ConfirmEvent[] {
    const events: ConfirmEvent[] = [];
    if (!active) return events;
    // Track endet mit noch offenem Kandidaten → best-effort Rettung des letzten Winkels,
    // wenn er zwischenzeitlich wirklich getragen hat (accept, ≥ medium, stabiler Schenkel).
    const bearingStable = active.latestStraightAfter >= cfg.bearingStableMin;
    const rescue = active.everAccept
      && active.bestConfidence >= cfg.mediumConfidence
      && bearingStable
      && active.confirmDistanceM >= cfg.rescueMinOutboundM;
    events.push(rescue ? finalize(active, 'confirmed', 'flush_end') : finalize(active, 'expired', 'flush_no_evidence'));
    active = null;
    return events;
  }

  return {
    observe,
    flush,
    reset() { active = null; },
    peek() { return active ? { apexCumDist: active.apexCumDist, kind: active.kind } : null; },
  };
}

// Index des Punktes, dessen Along-Track-Distanz dem Ziel am nächsten liegt.
function nearestIndex(points: readonly AutoCornerPoint[], cumDist: number): number | null {
  if (!points.length) return null;
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(points[i].cumDist - cumDist);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}

function toObservation(
  c: CornerCandidate, apex: AutoCornerPoint, latestCumDist: number, nowMs: number,
): CornerObservation {
  return {
    apexCumDist: apex.cumDist, apexLat: apex.lat, apexLng: apex.lng, latestCumDist,
    state: c.state, confidence: c.confidence, level: c.level, kind: c.kind,
    angleDeg: c.angleDeg, factors: c.factors, accuracyM: apex.accuracy, tMs: nowMs,
  };
}

// Integrations-Helfer: EINE Quelle für Recorder UND Tests. Wählt die Beobachtung so,
// dass ein laufender Kandidat weiter über DENSELBEN Scheitel bewertet wird (Candidate
// Identity, Section 8), und entdeckt sonst über evaluateBestCorner einen neuen Winkel.
export function feedCornerBuffer(
  confirmer: CornerConfirmer,
  points: readonly AutoCornerPoint[],
  lastCornerAtM: number,
  nowMs: number,
  quality?: ConfirmQuality,
): ConfirmEvent[] {
  if (points.length < 3) return confirmer.observe(null, quality);
  const latestCumDist = points[points.length - 1].cumDist;
  const active = confirmer.peek();

  let obs: CornerObservation | null = null;
  if (active) {
    // Laufenden Kandidaten IMMER am eigenen Scheitel neu klassifizieren (auch wenn er
    // gerade kein accept mehr ist → Miss/Reject fließt so korrekt ein).
    const idx = nearestIndex(points, active.apexCumDist);
    if (idx != null) obs = toObservation(classifyCornerCandidate(points, idx), points[idx], latestCumDist, nowMs);
  } else {
    const best = evaluateBestCorner(points, lastCornerAtM);
    if (best) obs = toObservation(best.candidate, points[best.apexIndex], latestCumDist, nowMs);
  }
  return confirmer.observe(obs, quality);
}
