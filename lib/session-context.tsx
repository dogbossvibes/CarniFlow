import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type Session, type User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { initLocaleSync, stopLocaleSync } from '@/services/localeSync';

type SessionCtx = {
  session: Session | null;
  user:    User    | null;
  loading: boolean;
};

const Ctx = createContext<SessionCtx>({ session: null, user: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Bootstrap-Abschluss GARANTIEREN: `loading` darf niemals dauerhaft true
    // bleiben, sonst hängt die App am Splash/Spinner. `getSession()` wird
    // deshalb mit catch UND einem 8s-Timeout abgesichert — antwortet es nicht
    // (Storage-/Lock-/Netzwerkproblem), geht es ohne Session weiter (→ Login).
    let done = false;
    const finish = (s: Session | null) => {
      if (done) return;
      done = true;
      setSession(s);
      setLoading(false);
      if (s?.user) initLocaleSync(s.user.id);   // Sprache aus Profil (falls Sync aktiv)
    };

    const safety = setTimeout(() => {
      if (__DEV__) console.warn('[boot] getSession timeout (8s) — continue without session');
      finish(null);
    }, 8000);

    // Hydrate from AsyncStorage on mount.
    supabase.auth.getSession()
      .then(({ data: { session } }) => finish(session))
      .catch((e) => { if (__DEV__) console.warn('[boot] getSession failed', e); finish(null); })
      .finally(() => clearTimeout(safety));

    // Keep in sync with Supabase auth events (login, logout, token refresh).
    // Das erste INITIAL_SESSION-Event schließt den Bootstrap ebenfalls ab.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.user) initLocaleSync(session.user.id); else stopLocaleSync();
    });

    return () => { clearTimeout(safety); subscription.unsubscribe(); };
  }, []);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
