import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

const EXPECTED_PROJECT_REFS = {
  production: 'axkkhyqrjrtbkumaulta',
  staging: 'cbhrxkjclakzlvajyvfn',
} as const;

type BackendEnvironment = keyof typeof EXPECTED_PROJECT_REFS;

function configurationError(message: string): never {
  throw new Error(`[Supabase configuration] ${message}`);
}

function projectRefFromUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return configurationError('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') {
    return configurationError('EXPO_PUBLIC_SUPABASE_URL must use HTTPS.');
  }
  const match = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) {
    return configurationError('EXPO_PUBLIC_SUPABASE_URL must use the canonical Supabase project hostname.');
  }
  return match[1];
}

const backendEnvironment = process.env.EXPO_PUBLIC_BACKEND_ENV;
if (backendEnvironment !== 'production' && backendEnvironment !== 'staging') {
  configurationError('EXPO_PUBLIC_BACKEND_ENV must be production or staging.');
}
const validatedBackendEnvironment = backendEnvironment as BackendEnvironment;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!url) configurationError('EXPO_PUBLIC_SUPABASE_URL is required.');

const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!key) configurationError('EXPO_PUBLIC_SUPABASE_ANON_KEY is required.');

const projectRef = projectRefFromUrl(url);
if (projectRef !== EXPECTED_PROJECT_REFS[validatedBackendEnvironment]) {
  configurationError(`Supabase project does not match the ${validatedBackendEnvironment} backend target.`);
}

// Für progress-fähige Direct-Uploads zum Storage-REST-Endpoint.
export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = key;
export const SUPABASE_BACKEND_ENV: BackendEnvironment = validatedBackendEnvironment;
export const SUPABASE_PROJECT_REF = projectRef;

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
