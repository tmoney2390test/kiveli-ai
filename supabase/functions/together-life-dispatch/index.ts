import { adminClient, serverEnv } from '../_shared/context.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';
import { reconcilePushReceipts } from '../_shared/kivelle-push.ts';
import { evaluateOperationalAlerts } from '../_shared/kivelle-ops.ts';
// Keep transitive subscription/media dependencies in Supabase's API deployment bundle.
import '../_shared/kivelle-subscription.ts';

serve(async (request, correlationId) => {
  if (request.method !== 'POST') throw new AppError('NOT_FOUND', 'That endpoint is unavailable.', 404);
  const expected = serverEnv('TOGETHER_LIFE_DISPATCH_SECRET');
  const supplied = request.headers.get('x-together-dispatch-secret');
  if (!supplied || !constantTimeEqual(supplied, expected)) throw new AppError('FORBIDDEN', 'Life dispatch authorization failed.', 403);
  const db = adminClient();
  const now = new Date();
  await reconcilePushReceipts(db);
  const cutoff = new Date(now.getTime() - 20 * 60000).toISOString();
  const { data: instances, error } = await db.from('together_character_instances').select('id,user_id').or(`last_simulated_at.lt.${cutoff},last_simulated_at.is.null`).order('last_simulated_at', { ascending: true, nullsFirst: true }).limit(25);
  if (error) throw new AppError('INTERNAL_ERROR', 'Life dispatch could not load characters.', 500, true);
  const results = { processed: 0, events: 0, messages: 0, failures: 0 };
  for (const instance of instances ?? []) {
    try {
      const run = await runLifeSimulation({ db, userId: instance.user_id, characterInstanceId: instance.id, now, evaluateProactive: true, trigger: 'scheduled_dispatch' });
      results.processed += 1;
      results.events += Array.isArray(run.events) ? run.events.length : 0;
      results.messages += run.proactiveMessage ? 1 : 0;
    } catch (dispatchError) {
      results.failures += 1;
      console.error(JSON.stringify({ level: 'error', operation: 'together_life_dispatch', characterInstanceId: instance.id, message: dispatchError instanceof Error ? dispatchError.message : 'unknown_error' }));
    }
  }
  try {
    await evaluateOperationalAlerts(db,{deliver:true,trigger:'scheduled',now});
  } catch (alertError) {
    // Monitoring must never block the Life simulation it observes.
    console.error(JSON.stringify({level:'error',operation:'kivelle_ops_alert_evaluation',message:alertError instanceof Error?alertError.message:'unknown_error'}));
  }
  return json({ data: results, correlationId }, 200, correlationId);
});
