import {
  createRevenueCatWebhookHandler,
  planOfRevenueCatProduct,
} from '../_shared/revenuecat-webhook'

const uid = '11111111-1111-4111-8111-111111111111'

function makeAdmin() {
  const calls: { kind: string; table?: string; name?: string; values?: Record<string, unknown>; args?: Record<string, unknown> }[] = []
  return {
    calls,
    admin: {
      from: (table: string) => ({
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            calls.push({ kind: 'update', table, values })
          },
        }),
        upsert: async (values: Record<string, unknown>) => {
          calls.push({ kind: 'upsert', table, values })
        },
      }),
      rpc: async (name: string, args?: Record<string, unknown>) => {
        calls.push({ kind: 'rpc', name, args })
        return { data: name === 'claim_founder_slot' ? [{ success: true }] : null }
      },
    },
  }
}

function makeHandler(expectedStore: 'app_store' | 'play_store', admin: ReturnType<typeof makeAdmin>['admin']) {
  return createRevenueCatWebhookHandler({
    expectedStore,
    env: { get: (key) => key === 'RC_WEBHOOK_SECRET' ? 'secret' : 'x' },
    createAdmin: () => admin,
    now: () => new Date('2026-08-01T00:00:00.000Z'),
  })
}

function request(event: Record<string, unknown>, authorization = 'secret') {
  return new Request('https://example.test', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : undefined,
    body: JSON.stringify({ event }),
  })
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

describe('revenuecat shared webhook handler', () => {
  it('verarbeitet Apple-Events am Apple-Endpunkt', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'INITIAL_PURCHASE',
      app_user_id: uid,
      product_id: 'anyvo_active_monthly_10',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, plan: 'active' })
    expect(calls.some((call) => call.kind === 'upsert' && call.table === 'subscriptions')).toBe(true)
  })

  it('ignoriert Google-Events am Apple-Endpunkt ohne DB-Schreibaktion', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'INITIAL_PURCHASE',
      app_user_id: uid,
      product_id: 'anyvo_active_monthly_10',
      store: 'PLAY_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, ignored: 'store_mismatch' })
    expect(calls).toHaveLength(0)
  })

  it('verarbeitet Google-Events am Google-Endpunkt', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('play_store', admin)

    const response = await handler(request({
      type: 'RENEWAL',
      app_user_id: uid,
      product_id: 'anyvo_trainer_monthly_30.00',
      store: 'PLAY_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, plan: 'trainer' })
    expect(calls.some((call) => call.kind === 'upsert' && call.table === 'user_capabilities' && call.values?.trainer_module === true)).toBe(true)
  })

  it('ignoriert Apple-Events am Google-Endpunkt ohne DB-Schreibaktion', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('play_store', admin)

    const response = await handler(request({
      type: 'INITIAL_PURCHASE',
      app_user_id: uid,
      product_id: 'anyvo_active_monthly_10',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, ignored: 'store_mismatch' })
    expect(calls).toHaveLength(0)
  })

  it('ignoriert TEST-Events ohne DB-Schreibaktion', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'TEST',
      app_user_id: uid,
      product_id: 'anyvo_active_monthly_10',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, ignored: 'test_event' })
    expect(calls).toHaveLength(0)
  })

  it('CANCELLATION entzieht Zugriff nicht und setzt keinen Founder-Lapse', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'CANCELLATION',
      app_user_id: uid,
      product_id: 'anyvo_founder_active_monthly_8.00',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, ignored: 'access_until_expiration' })
    expect(calls).toHaveLength(0)
  })

  it('BILLING_ISSUE entzieht Zugriff nicht und setzt keinen Founder-Lapse', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'BILLING_ISSUE',
      app_user_id: uid,
      product_id: 'anyvo_founder_active_monthly_8.00',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, ignored: 'access_until_expiration' })
    expect(calls).toHaveLength(0)
  })

  it('EXPIRATION entzieht Zugriff und markiert Founder als lapsed', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'EXPIRATION',
      app_user_id: uid,
      product_id: 'anyvo_founder_active_monthly_8.00',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, plan: 'expired' })
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'update', table: 'subscriptions', values: expect.objectContaining({ status: 'expired' }) }),
      expect.objectContaining({ kind: 'upsert', table: 'user_capabilities', values: expect.objectContaining({ pro_member: false, trainer_module: false }) }),
      expect.objectContaining({ kind: 'rpc', name: 'lapse_founder_slot' }),
    ]))
    expect(calls.some((call) => call.kind === 'delete')).toBe(false)
  })

  it('REFUND entzieht Zugriff und markiert Founder als lapsed ohne Delete', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'REFUND',
      app_user_id: uid,
      product_id: 'anyvo_founder_active_monthly_8.00',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, plan: 'cancelled' })
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'update', table: 'subscriptions', values: expect.objectContaining({ status: 'cancelled' }) }),
      expect.objectContaining({ kind: 'upsert', table: 'user_capabilities', values: expect.objectContaining({ pro_member: false, trainer_module: false }) }),
      expect.objectContaining({ kind: 'rpc', name: 'lapse_founder_slot' }),
    ]))
    expect(calls.some((call) => call.kind === 'delete')).toBe(false)
  })

  it('RENEWAL und PRODUCT_CHANGE halten bekannte Pläne aktiv und aktualisieren Ablaufdaten', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    await handler(request({
      type: 'RENEWAL',
      app_user_id: uid,
      product_id: 'anyvo_active_monthly_10',
      expiration_at_ms: 1785628800000,
      store: 'APP_STORE',
    }))
    await handler(request({
      type: 'PRODUCT_CHANGE',
      app_user_id: uid,
      new_product_id: 'anyvo_trainer_monthly_30.00',
      expiration_at_ms: 1785628800000,
      store: 'APP_STORE',
    }))

    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'upsert', table: 'subscriptions', values: expect.objectContaining({ plan: 'active', status: 'active' }) }),
      expect.objectContaining({ kind: 'upsert', table: 'subscriptions', values: expect.objectContaining({ plan: 'trainer', status: 'active' }) }),
      expect.objectContaining({ kind: 'upsert', table: 'user_capabilities', values: expect.objectContaining({ trainer_module: true }) }),
    ]))
    expect(calls.some((call) => call.values?.expires_at === new Date(1785628800000).toISOString())).toBe(true)
  })

  it('INITIAL_PURCHASE für Founder claimt den Founder-Slot', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    const response = await handler(request({
      type: 'INITIAL_PURCHASE',
      app_user_id: uid,
      product_id: 'anyvo_founder_active_monthly_8.00',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, plan: 'founder_active' })
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'rpc', name: 'claim_founder_slot' }),
      expect.objectContaining({ kind: 'upsert', table: 'subscriptions', values: expect.objectContaining({ plan: 'founder_active' }) }),
    ]))
  })

  it('lehnt fehlenden oder falschen Authorization-Header ab', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    expect((await handler(request({ type: 'TEST' }, ''))).status).toBe(401)
    expect((await handler(request({ type: 'TEST' }, 'wrong'))).status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('mappt unbekannte product_id niemals automatisch auf active', async () => {
    const { admin, calls } = makeAdmin()
    const handler = makeHandler('app_store', admin)

    expect(planOfRevenueCatProduct('unknown_product')).toBeNull()
    const response = await handler(request({
      type: 'INITIAL_PURCHASE',
      app_user_id: uid,
      product_id: 'unknown_product',
      store: 'APP_STORE',
    }))

    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, ignored: 'unknown_product_id' })
    expect(calls).toHaveLength(0)
  })
})
