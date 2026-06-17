# ANYVO — Sprachsteuerung & Sprachdokumentation

Reuse-basiert: nutzt den bestehenden Audio-Upload (`mediaService.uploadAudio`,
Bucket `media-audio`) + expo-audio. NEU sind nur Transkription, Sprachmarker,
Sprachsteuerung und die `voice_notes`-Tabelle.

## Struktur
- `VOICE_NOTES_SETUP.sql` — `voice_notes` (+ `training_unit_id`), RLS (eigene + Trainer via `can_view`). **Live angewandt.**
- `supabase/functions/transcribe-voice-note` — Whisper (OPENAI_API_KEY) oder `disabled`. **Deployt.**
- `features/voice/services/` — `voiceRecordingService` (Permission/Utils), `voiceUploadService` (Upload→voice_notes), `transcriptionProvider` (OpenAI/Mock), `voiceCommandParser` (Synonyme inkl. CH-Deutsch).
- `features/voice/store/voiceStore.ts` (Zustand), `features/voice/hooks/` (useVoiceRecorder/useVoiceNotes/useTranscription/useVoiceCommands), `features/voice/components/` (VoiceRecorderCard/VoiceNotePlayer/VoiceNotesList/VoiceCommandButton).
- Integration: `unit/detail` (Sprachmemos-Section), `track/record` + `track/run` (Sprachsteuerung + Sprachmarker).

## Deploy / Setup
1. `VOICE_NOTES_SETUP.sql` ist bereits angewandt (Supabase `axkkhyqrjrtbkumaulta`).
2. Edge Function `transcribe-voice-note` ist deployt.
3. **Transkription aktivieren** (optional): `supabase secrets set OPENAI_API_KEY=… --project-ref axkkhyqrjrtbkumaulta`. Ohne Key bleibt `transcript_status='disabled'` — Memos bleiben nutzbar.
4. **Live-Sprachsteuerung** braucht das native Modul `expo-speech-recognition` → **neuer Dev-/TestFlight-Build** (Config-Plugin + Permissions in app.json ergänzt).

## Sprachbefehle (Fährtenmodus)
„Gegenstand/Winkel/Verleitung [setzen]", „Pause", „Weiter", „Training beenden",
„Standort zentrieren", „Audio an/aus" — Parser in `voiceCommandParser.ts` (Synonyme + CH-Varianten).

## Offene Folgeschritte (TODO)
- **Doku-Flow** (`unit/document`): Sprachmemo *während* der Erstellung (vor Unit-Anlage) — Memos müssten nach `createDocumentedUnit` per `training_unit_id` verknüpft werden. Aktuell: Memos über `unit/detail` (Einheit existiert) hinzufügen.
- **Offline-Queue:** lokale Aufnahme funktioniert; eine echte Upload-Queue bei Offline ist vorbereitet, aber noch nicht persistent implementiert.
