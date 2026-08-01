type Store = 'app_store' | 'play_store'
type Plan = 'newbie' | 'founder_active' | 'active' | 'trainer'

type SupabaseAdmin = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> }
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  }
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data?: unknown }>
}

type HandlerOptions = {
  expectedStore: Store
  env: { get: (key: string) => string | undefined }
  createAdmin: (supabaseUrl: string, serviceRoleKey: string) => SupabaseAdmin
  now?: () => Date
  logger?: Pick<Console, 'error'>
}

const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE'])
const REVOKE_STATUS: Record<string, 'expired' | 'cancelled'> = {
  EXPIRATION: 'expired',
  REFUND: 'cancelled',
}
const DEFERRED = new Set(['CANCELLATION', 'BILLING_ISSUE'])

const PRODUCT_PLANS: Record<string, Plan> = {
  anyvo_newbie_monthly_0: 'newbie',
  'anyvo_founder_active_monthly_8.00': 'founder_active',
  anyvo_active_monthly_10: 'active',
  'anyvo_trainer_monthly_30.00': 'trainer',
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function normalizeStore(store: unknown): Store | null {
  if (typeof store !== 'string') return null
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE' || store === 'app_store') return 'app_store'
  if (store === 'PLAY_STORE' || store === 'play_store') return 'play_store'
  return null
}

export function planOfRevenueCatProduct(productId: string): Plan | null {
  return PRODUCT_PLANS[productId] ?? null
}

export const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export function createRevenueCatWebhookHandler(options: HandlerOptions) {
  const now = options.now ?? (() => new Date())
  const logger = options.logger ?? console

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const secret = options.env.get('RC_WEBHOOK_SECRET')
    if (!secret || req.headers.get('Authorization') !== secret) {
      return new Response('Unauthorized', { status: 401 })
    }

    try {
      const body = await req.json()
      const ev = body?.event ?? {}
      const type: string = ev.type ?? ''
      const uid: string = ev.app_user_id ?? ''
      const productId: string = ev.product_id ?? ev.new_product_id ?? ''
      const store = normalizeStore(ev.store)

      if (type === 'TEST') return json({ ok: true, type, ignored: 'test_event' })
      if (store !== options.expectedStore) return json({ ok: true, type, ignored: 'store_mismatch' })
      if (DEFERRED.has(type)) return json({ ok: true, type, ignored: 'access_until_expiration' })
      if (!isUuid(uid)) return json({ ok: true, skipped: 'non-uuid app_user_id' })

      const admin = options.createAdmin(
        options.env.get('SUPABASE_URL')!,
        options.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      )
      const expiresAt = ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null

      if (type in REVOKE_STATUS) {
        await admin.from('subscriptions').update({ status: REVOKE_STATUS[type], updated_at: now().toISOString() }).eq('user_id', uid)
        await admin.from('user_capabilities').upsert({ user_id: uid, pro_member: false, trainer_module: false, updated_at: now().toISOString() }, { onConflict: 'user_id' })
        await admin.from('profiles').update({ plan: 'free', plan_expires_at: null, is_trainer: false }).eq('id', uid)
        await admin.rpc('lapse_founder_slot', { p_user_id: uid })
        return json({ ok: true, type, plan: REVOKE_STATUS[type] })
      }

      if (GRANT.has(type) && productId) {
        let plan = planOfRevenueCatProduct(productId)
        if (!plan) return json({ ok: true, type, ignored: 'unknown_product_id' })

        if (plan === 'founder_active') {
          const { data } = await admin.rpc('claim_founder_slot', { p_user_id: uid })
          const row = Array.isArray(data) ? data[0] : data
          if (!(row as { success?: boolean } | null)?.success) plan = 'active'
        }

        const trainer = plan === 'trainer'
        const pro = plan !== 'newbie'
        await admin.from('subscriptions').upsert({
          user_id: uid,
          plan,
          status: 'active',
          tier: trainer ? 'trainer' : (pro ? 'pro' : 'free'),
          product_id: productId,
          provider: store,
          store,
          provider_product_id: productId,
          current_period_ends_at: expiresAt,
          expires_at: expiresAt,
          updated_at: now().toISOString(),
        }, { onConflict: 'user_id' })
        await admin.from('user_capabilities').upsert({ user_id: uid, pro_member: pro, trainer_module: trainer, updated_at: now().toISOString() }, { onConflict: 'user_id' })
        await admin.from('profiles').update({ plan: pro ? 'premium' : 'free', plan_expires_at: pro ? expiresAt : null, trial_used: true, is_trainer: trainer }).eq('id', uid)

        return json({ ok: true, type, plan })
      }

      return json({ ok: true, type, ignored: true })
    } catch (e) {
      logger.error('[revenuecat-webhook]', (e as Error)?.message ?? e)
      return json({ ok: false }, 500)
    }
  }
}
