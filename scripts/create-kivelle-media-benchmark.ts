import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes('--apply');
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const routes = [
  'wavespeed-zimage-lora',
  'wavespeed-zimage-i2i-lora',
  'wavespeed-multiref',
  'wavespeed-flux-edit-lora',
  'wavespeed-chroma',
];
const scenarios = [
  'portrait_identity_day',
  'candid_character_location_night',
  'full_body_outfit_continuity',
  'scene_location_architecture',
  'selfie_character_location',
];

async function main() {
  const summary = { routes, scenarios, resultCount: routes.length * scenarios.length, rubric: ['face consistency', 'body consistency', 'adult age consistency', 'location identity', 'architecture preservation', 'outfit continuity', 'anatomy', 'prompt adherence', 'naturalness', 'latency', 'provider cost', 'first-attempt usable'] };
  if (!apply) { console.log(JSON.stringify({ ...summary, mode: 'dry-run' })); return; }
  const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const run = await db.from('together_media_benchmark_runs').insert({ name: `WaveSpeed capability benchmark ${new Date().toISOString()}`, status: 'draft', route_ids: routes, scenario_keys: scenarios, summary: { rubric: summary.rubric, note: 'Draft only. A staff reviewer must explicitly run each validated route and score output before promotion.' } }).select('id').single();
  if (run.error || !run.data) throw run.error ?? new Error('Benchmark run could not be created.');
  const rows = routes.flatMap((routeId) => scenarios.map((scenarioKey) => ({ run_id: run.data.id, route_id: routeId, scenario_key: scenarioKey, status: 'queued', metadata: { requiresExplicitStaffRun: true } })));
  const inserted = await db.from('together_media_benchmark_results').insert(rows);
  if (inserted.error) throw inserted.error;
  console.log(JSON.stringify({ ...summary, mode: 'apply', benchmarkRunId: run.data.id }));
}

await main();
