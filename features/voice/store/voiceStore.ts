import { create } from 'zustand';
import type { VoiceCommand } from '@/features/voice/services/voiceCommandParser';

interface VoiceState {
  isRecording:          boolean;
  isPaused:             boolean;
  recordingUri:         string | null;
  durationSeconds:      number;
  isUploading:          boolean;
  isTranscribing:       boolean;
  activeVoiceNoteId:    string | null;
  voiceCommandEnabled:  boolean;
  isListening:          boolean;
  lastRecognizedCommand: VoiceCommand | null;

  startRecording:  () => void;
  pauseRecording:  () => void;
  resumeRecording: () => void;
  stopRecording:   (uri: string | null, duration: number) => void;
  resetRecording:  () => void;
  setDuration:     (sec: number) => void;
  setUploading:    (on: boolean) => void;
  setTranscribing: (on: boolean) => void;
  setActiveVoiceNoteId: (id: string | null) => void;
  setVoiceCommandEnabled: (on: boolean) => void;
  setListening:    (on: boolean) => void;
  setLastRecognizedCommand: (c: VoiceCommand | null) => void;
}

const REC_INITIAL = { isRecording: false, isPaused: false, recordingUri: null as string | null, durationSeconds: 0, isUploading: false, isTranscribing: false };

export const useVoiceStore = create<VoiceState>((set) => ({
  ...REC_INITIAL,
  activeVoiceNoteId:     null,
  voiceCommandEnabled:   false,
  isListening:           false,
  lastRecognizedCommand: null,

  startRecording:  () => set({ isRecording: true, isPaused: false, durationSeconds: 0, recordingUri: null }),
  pauseRecording:  () => set({ isPaused: true }),
  resumeRecording: () => set({ isPaused: false }),
  stopRecording:   (uri, duration) => set({ isRecording: false, isPaused: false, recordingUri: uri, durationSeconds: duration }),
  resetRecording:  () => set({ ...REC_INITIAL }),
  setDuration:     (sec) => set({ durationSeconds: sec }),
  setUploading:    (on) => set({ isUploading: on }),
  setTranscribing: (on) => set({ isTranscribing: on }),
  setActiveVoiceNoteId: (id) => set({ activeVoiceNoteId: id }),
  setVoiceCommandEnabled: (on) => set({ voiceCommandEnabled: on, isListening: on ? false : false }),
  setListening:    (on) => set({ isListening: on }),
  setLastRecognizedCommand: (c) => set({ lastRecognizedCommand: c }),
}));
