import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { useSession } from '@/hooks/useSession';
import { wearableTransport } from '@/modules/anyvo-wearable-control';
import { WearableController } from './controller';
import type { WearableBinding } from './controller';
const Context = createContext<WearableController | null>(null);
export function WearableProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const owner = session?.user.id ?? null;
  const controller = useMemo(() => {
    const next = new WearableController({ now: Date.now, id: Crypto.randomUUID }); next.setOwner(owner); return next;
  }, [owner]);
  useEffect(() => {
    const transport = wearableTransport;
    if (!transport) return () => controller.setOwner(null);
    let disposed = false;
    const publish = async () => {
      if (disposed) return;
      try { await transport.publishSnapshot(JSON.stringify(controller.snapshot())); } catch { /* unavailable pair: no recorder impact */ }
    };
    // An auth transition clears native cached state before issuing this owner's state.
    void transport.clear().then(publish).catch(() => undefined);
    const unsubscribe = controller.subscribe(() => { void publish(); });
    const commandSub = transport.addListener('onCommand', event => {
      if (disposed || typeof event.requestId !== 'string' || !event.requestId || typeof event.peerId !== 'string' || !event.peerId
        || typeof event.json !== 'string' || typeof event.expiresAtMs !== 'number') return;
      void controller.receive(event.json, event.expiresAtMs).then(async result => {
        if (!disposed) await transport.respond(event.requestId, JSON.stringify(result));
      }).catch(() => undefined);
    });
    const connectionSub = transport.addListener('onConnection', event => { if (event.connected) void publish(); });
    const timer = setInterval(() => { void publish(); }, 10_000);
    return () => {
      disposed = true; unsubscribe(); clearInterval(timer); commandSub.remove(); connectionSub.remove();
      controller.setOwner(null); void transport.clear().catch(() => undefined);
    };
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
/** Only the visible recording screen registers authority. No handler is restored from storage. */
export function useWearableBinding(owner: string | null, identity: string, enabled: boolean, binding: WearableBinding) {
  const controller = useContext(Context);
  const latest = useRef(binding); latest.current = binding;
  useEffect(() => {
    if (!controller || !owner || !enabled) return;
    return controller.register(owner, {
      getState: () => latest.current.getState(),
      execute: (action, stillCurrent) => latest.current.execute(action, stillCurrent),
    });
  }, [controller, owner, identity, enabled]);
  useEffect(() => { controller?.changed(); }, [controller, binding]);
}
