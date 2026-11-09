import { webhookHandler } from '../_shared/handlers.ts';
import { ownedRuntime } from '../_shared/runtime.ts';
Deno.serve(webhookHandler(ownedRuntime(), Deno.env.get('RC_WEBHOOK_SECRET')));
