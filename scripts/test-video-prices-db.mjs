import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table together_media_provider_jobs(route_id text,status text,generated_media_id uuid,provider_metadata jsonb,quoted_provider_cost_usd numeric,actual_provider_cost_usd numeric,created_at timestamptz,finalized_at timestamptz);create table together_generated_media(id uuid,metadata jsonb);");
const sql=readFileSync('supabase/migrations/20260910203720_two_video_tiers_pricing.sql','utf8').split("select cron.schedule")[0];
await db.exec(sql);
assert.deepEqual((await db.query('select * from kivelle_video_cost_summary()')).rows,[{kivelle_video_cost_summary:[]}]);
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 await assert.rejects(()=>db.query('select * from together_video_price_observations'),/permission denied/);
 await assert.rejects(()=>db.query('select kivelle_claim_video_price_monitor()'),/permission denied/);
 await assert.rejects(()=>db.query("insert into together_video_price_publications(credits_per_unit,minimum_credits,reason) values(1,1,'attack')"),/permission denied/);
 await db.exec('reset role');
}
await db.exec('set role service_role');
const first=(await db.query('select kivelle_claim_video_price_monitor() as id')).rows[0].id;
assert(first);
assert.equal((await db.query('select kivelle_claim_video_price_monitor() as id')).rows[0].id,null);
await db.query('update together_video_price_runs set completed_at=now() where id=$1',[first]);
assert((await db.query('select kivelle_claim_video_price_monitor() as id')).rows[0].id);
await db.exec("insert into together_video_price_observations(route_id,settings_key,source,list_price_usd,payable_price_usd) values('test','720p:5:sound','monitor',.4,0)");
await assert.rejects(()=>db.query('delete from together_video_price_observations'),/permission denied/);
console.log('PASS: migration, Ops-only grants, append-only history, zero-price observations and single monitor lease');
await db.close();
