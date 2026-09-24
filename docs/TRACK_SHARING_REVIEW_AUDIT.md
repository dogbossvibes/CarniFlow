# Persisted trainer review audit — Phase 2D

No tracking calculations, schema changes or remote writes. `trackShareService.getSharedTrack`
already supplies the session and restricted owner/dog names through `shared_track_display`.
The screen also uses the existing `getTrackSessionById` for points, markers, runs and engine.
No new data-service queries or broad profile access were necessary.

## Field matrix

“Supplied” below means the combined existing share/detail read path, not solely the share row.
Availability always depends on the saved session; older/missing values display “Nicht verfügbar”.

| Information | Owner detail | Persisted source | Supplied | Trainer before → now |
|---|---|---|---|---|
| Dog | Yes | restricted display helper / dogs.name | Yes | Yes → Yes |
| Owner | Own account context | restricted display helper / owner_name | Yes | No → Yes |
| Date; start/end | Date visible | session_date, started_at, ended_at | Yes | Date only → all |
| Duration | Loaded; feed displays duration | search_duration_seconds then duration_seconds; saved run fallback | Yes | No → Yes |
| Laying duration | Loaded | laying_duration_seconds | Yes | No → Yes |
| Distance | Yes | distance_meters | Yes | Yes → Yes |
| Steps | No canonical total displayed | No canonical persisted session step total established | Not established | Omitted (no derived total) |
| Weather | Yes | weather_condition/wetter, temperature, wind_speed, humidity | Yes | Partial → all |
| Notes | Yes | notes | Yes | Yes → Yes |
| Laid route, start/end | Yes | track_points via buildTrackDetailMap | Yes | Yes → unchanged |
| Search route | Yes | track_runs.run_points via buildTrackDetailMap | Yes | Yes → unchanged |
| Corners/sharp corners/objects/markers | Yes | track_markers type, angle_kind, material, positions | Yes | Yes → unchanged |
| GPS quality | Engine/session loaded | gps_quality_average (mean accuracy metres), engine.average_accuracy fallback | Yes | No → Yes |
| Confidence/hint | Yes | run.analytics.analysisConfidence, analysisConfidenceBand, analysisConfidenceHint | Yes | Band only → all |
| Track Score | Yes | run.analytics.trackScore (not manual score) | Yes | Yes → Yes |
| Mean/median/P95/max deviation | Partial | deviation.meanM, medianM, p95M, maxReliableM, maxRawM | Yes | Partial → all |
| Corridor times | Persisted, not overview | deviation.timeWithinM15S, timeWithinM2S, timeOutsideM3S, timeOutsideM5S | Yes | No → Yes |
| Pace | Partial | pace.avgMps, medianMps, consistency, stopGoPhases | Yes | Average only → all |
| Reacquisition | Yes | reacquisition.count, completedCount, meanSec, maxSec | Yes | Count only → details |
| Assessable distance/events | Yes (v3) | assessableDistance.percent, deviationEvents | Yes | No → Yes |
| Corners individually | Yes | corners[] order, atM, side, sharpness, arrivalTSec, speedBeforeMps, speedAfterMps, speedChangePercent, minDistanceM, maxLateralDeviationM, overshootM, reacquisitionSec, stabilizationTimeSec, stabilizationDistanceM, confidence, interpretation | Yes | No → Yes |
| Numeric corner angle | Kind only | No numeric angle in saved analytics corner contract | No | Omitted; never infer 90° |
| Objects individually (v3) | Status/material | objects[].objectIndex, alongTrackPositionM, legIndex, material, minRecordedDistanceM, speedBeforeMps, minimumSpeedMps, speedAfterMps, stopDurationSec, proximityWindowStartSec/EndSec, contactConfidence, status, reasonCodes | Yes | No → Yes |
| Legacy objects | Limited | objects[].atM, minDistanceM, approachSpeedMps, timeInAreaSec, behavior, material | Yes | No → Yes |
| Object context/angle association/confidence | Not available | No dedicated saved context/angle association fields found; legIndex is a leg, contactConfidence is NOT association confidence | No | Not invented; show saved leg and contact confidence only |
| Highlights | Persisted v2/v3 | segmentHighlights labelKey, segmentIndex, valueText | Yes | No → Yes |

## Inspection sources

- `app/track/[id].tsx`, `app/trainer/shared-track/[id].tsx`
- `services/trackShareService.ts`, `services/trainingFeed.ts`
- `features/tracking/services/trackService.ts`
- `features/sync/services/remoteTrainingSyncService.ts`
- `features/tracking/utils/trackDetailMap.ts`, `trackAnalysisState.ts`, `localTrackDetail.ts`
- `features/tracking/engine/trackAnalytics.ts`, `trackAnalyticsV3.ts`, `trackSegmentAnalysis.ts`
- `features/tracking/hooks/useTrackRecording.ts` (accuracy units only)

## Validation scope

Single-column natural-height readout, wrapping feedback actions, SafeAreaView and keyboard avoidance.
Static layout review at 320/360/375/390/414/430 widths; no device/simulator visual test claimed.
No new analytics, angle/context association, GPS quality score, step totals or replay generation.
Replay remains follow-up. Runtime remote access/RLS cannot be proven by these local presentation tests.
