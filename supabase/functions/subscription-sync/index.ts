import { syncHandler } from '../_shared/handlers.ts';
import { ownedRuntime } from '../_shared/runtime.ts';
Deno.serve(syncHandler(ownedRuntime()));
