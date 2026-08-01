import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRevenueCatWebhookHandler } from '../_shared/revenuecat-webhook.ts'

serve(createRevenueCatWebhookHandler({
  expectedStore: 'play_store',
  env: Deno.env,
  createAdmin: (supabaseUrl, serviceRoleKey) => createClient(supabaseUrl, serviceRoleKey),
}))
