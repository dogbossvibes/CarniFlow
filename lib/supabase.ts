import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? 'https://axkkhyqrjrtbkumaulta.supabase.co';

const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4a2toeXFyanJ0Ymt1bWF1bHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzAwNjQsImV4cCI6MjA5NTMwNjA2NH0.K9GwIWsqi2g5HK7P7xCezFeFd4lbgr8Rqqrkpxd8uFE';

// Für progress-fähige Direct-Uploads zum Storage-REST-Endpoint.
export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = key;

export const supabase = createClient(url, key, {
  auth: {
    storage:            Platform.OS !== 'web' ? AsyncStorage : undefined,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
    flowType:           'pkce',
  },
});

// Keep the access token fresh when the app comes back to the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else                    supabase.auth.stopAutoRefresh();
});
