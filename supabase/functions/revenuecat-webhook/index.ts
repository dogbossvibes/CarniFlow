import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// RevenueCat-Webhook: macht Käufe SERVERSEITIG autoritativ.
//  • Setzt Plan/Capabilities aus der Produkt-ID (kein Trust-the-Client mehr).
//  • Founder: beansprucht den Slot atomar (max 77). Über-77-Kauf (Bypass der App)
//    → Downgrade auf „active". Slot wird bei EXPIRATION wieder freigegeben.
// Auth: RevenueCat sendet einen frei konfigurierbaren Authorization-Header,
//       der gegen RC_WEBHOOK_SECRET geprüft wird.

const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE'])
const REVOKE = new Set(['EXPIRATION'])

type Plan = 'founder_active' | 'active' | 'trainer'

function planOfProduct(productId: string): Plan {
  if (/founder/i.test(productId)) return 'founder_active'
  if (/trainer/i.test(productId)) return 'trainer'
  return 'active'
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // 1) Auth gegen das in RevenueCat hinterlegte Secret.
  const secret = Deno.env.get('RC_WEBHOOK_SECRET')
  if (!secret || req.headers.get('Authorization') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = await req.json()
    const ev = body?.event ?? {}
    const type: string = ev.type ?? ''
    const uid: string = ev.app_user_id ?? ''
    const productId: string = ev.product_id ?? ev.new_product_id ?? ''

    // Anonyme RC-IDs ($RCAnonymousID:…) oder unbekannte User ignorieren.
    if (!isUuid(uid)) return new Response(JSON.stringify({ ok: true, skipped: 'non-uuid app_user_id' }), { status: 200 })

    const expiresAt = ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null

    // ── Revoke (Abo abgelaufen) ──
    if (REVOKE.has(type)) {
      await admin.from('subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('user_id', uid)
      await admin.from('user_capabilities').upsert({ user_id: uid, pro_member: false, trainer_module: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      await admin.from('profiles').update({ plan: 'free', plan_expires_at: null, is_trainer: false }).eq('id', uid)
      await admin.rpc('release_founder_slot', { p_user_id: uid })   // Slot freigeben (no-op wenn keiner)
      return new Response(JSON.stringify({ ok: true, type, plan: 'expired' }), { status: 200 })
    }

    // ── Grant (Kauf/Renewal) ──
    if (GRANT.has(type) && productId) {
      let plan = planOfProduct(productId)

      // Founder: Slot autoritativ beanspruchen. Ausverkauft (Bypass) → active.
      if (plan === 'founder_active') {
        const { data } = await admin.rpc('claim_founder_slot', { p_user_id: uid })
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.success) plan = 'active'
      }

      const trainer = plan === 'trainer'
      await admin.from('subscriptions').upsert({
        user_id: uid,
        plan,
        status: 'active',
        tier: trainer ? 'trainer' : 'pro',
        product_id: productId,
        provider: ev.store === 'PLAY_STORE' ? 'play_store' : 'app_store',
        store: ev.store === 'PLAY_STORE' ? 'play_store' : 'app_store',
        provider_product_id: productId,
        current_period_ends_at: expiresAt,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      await admin.from('user_capabilities').upsert({ user_id: uid, pro_member: true, trainer_module: trainer, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      await admin.from('profiles').update({ plan: 'premium', plan_expires_at: expiresAt, trial_used: true, is_trainer: trainer }).eq('id', uid)

      return new Response(JSON.stringify({ ok: true, type, plan }), { status: 200 })
    }

    // Andere Events (CANCELLATION=Auto-Renew aus, BILLING_ISSUE, TEST, …) → bestätigen, nichts tun.
    return new Response(JSON.stringify({ ok: true, type, ignored: true }), { status: 200 })
  } catch (e) {
    console.error('[revenuecat-webhook]', (e as Error)?.message ?? e)
    return new Response(JSON.stringify({ ok: false }), { status: 500 })
  }
})
