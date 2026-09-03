import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
// Keep transitive subscription/media dependencies in Supabase's API deployment bundle.
import '../_shared/kivelle-subscription.ts';
import { simulationRequestRateLimit } from '../_shared/together-request-limits.ts';

const schema = z.object({ characterInstanceId: z.string().uuid().optional(), now: z.string().datetime().optional(), evaluateProactive: z.boolean().default(true) });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const requestLimit=simulationRequestRateLimit();
  await enforceRateLimit(db,user.id,'together_simulate',requestLimit.limit,requestLimit.windowSeconds);
  const input = await parseBody(request, schema);
  const result = await runLifeSimulation({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now: input.now ? new Date(input.now) : new Date(), evaluateProactive: input.evaluateProactive, trigger: 'home_opened' });
  return json({ data: result, correlationId }, 200, correlationId);
});
