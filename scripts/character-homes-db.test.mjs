import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {eosHomes} from '../content/homes/eos-meridian.mjs';
const schema=readFileSync(new URL('./fixtures/character-homes-schema.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261105200017_character_home_visits_pilot.sql',import.meta.url),'utf8');
let sequence=1;const id=()=>`00000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;
async function seed(db,table,values){
  const columns=(await db.query(`select column_name,data_type from information_schema.columns where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null`,[table])).rows;
  const row={...values};
  for(const col of columns)if(!(col.column_name in row))row[col.column_name]=col.data_type==='uuid'?id():['integer','smallint','bigint','numeric','double precision'].includes(col.data_type)?1:col.data_type==='boolean'?false:col.data_type==='jsonb'?{}:col.data_type==='ARRAY'?[]:col.data_type.includes('timestamp')?new Date().toISOString():'Fixture';
  const keys=Object.keys(row);return (await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(row))).rows[0];
}
test('home migration preserves other worlds, private quotas, atomic invitations, and image history',async(t)=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_admin;create schema auth;create schema storage;
      create table auth.users(id uuid primary key);create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
      create function gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('00',$1),'hex')$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await db.exec(schema);
    const names=['together_character_homes','together_character_versions','together_character_templates','together_worlds','together_locations','together_character_instances','together_media_reference_assets','together_conversations','together_messages','together_conversation_actions','together_conversation_events'];
    for(const table of names)await db.exec(`alter table ${table} add primary key(id);`);
    await db.exec('alter table together_profiles add primary key(user_id);alter table together_entitlements add primary key(user_id);');
    await db.exec('create unique index together_media_reference_asset_revision_idx on together_media_reference_assets(asset_role,source_key,revision);alter table together_media_reference_assets add check(num_nonnulls(character_version_id,location_id,world_id)=1);');
    const world=await seed(db,'together_worlds',{id:id(),slug:'eos-meridian',name:'Eos Meridian',published:true});
    const other=await seed(db,'together_worlds',{id:id(),slug:'juniper-city',name:'Juniper City',published:true});
    const homes=[];
    for(const content of [...eosHomes,{slug:'other-resident'}]){
      const template=await seed(db,'together_character_templates',{id:id(),slug:content.slug,name:content.slug,creator_id:null,current_published_version:1,published:true});
      const version=await seed(db,'together_character_versions',{id:id(),character_template_id:template.id,version:1});
      homes.push(await seed(db,'together_character_homes',{id:id(),character_version_id:version.id,world_id:content.slug==='other-resident'?other.id:world.id,name:'Original home',residence_type:'private home',description:'Original untouched home description',prompt_text:'Original untouched home image direction',canonical_lore:{sentinel:'keep'},canonical_visual_context:{indoorOutdoor:'indoor'}}));
    }
    await db.exec(migration);
    await t.test('only the full Eos roster is enabled and queued once',async()=>{
      assert.equal((await db.query('select count(*)::int n from together_character_homes where visits_enabled')).rows[0].n,67);
      assert.equal((await db.query('select count(*)::int n from together_home_artwork')).rows[0].n,67);
      const untouched=(await db.query('select * from together_character_homes where world_id=$1',[other.id])).rows[0];
      assert.equal(untouched.description,'Original untouched home description');assert.equal(untouched.visits_enabled,false);
      assert.deepEqual(untouched.canonical_lore,{sentinel:'keep'});
    });
    const user=id(),otherUser=id(),life=id();
    await db.query('insert into auth.users values($1),($2)',[user,otherUser]);
    await seed(db,'together_profiles',{user_id:user,active_continuity_id:life});
    const instance=await seed(db,'together_character_instances',{id:id(),user_id:user,continuity_id:life,character_version_id:homes[0].character_version_id});
    let place;
    await t.test('private planning anchor is idempotent, owned, and uses canonical activities',async()=>{
      place=(await db.query('select * from kivelle_ensure_home_location($1,$2)',[user,instance.id])).rows[0];
      const again=(await db.query('select * from kivelle_ensure_home_location($1,$2)',[user,instance.id])).rows[0];
      assert.equal(place.id,again.id);assert.equal(place.owner_user_id,user);assert.equal(place.character_home_id,homes[0].id);
      assert.equal(place.category,'home');assert.equal(place.metadata.userCreated,false);
      assert.deepEqual(place.possible_activities,eosHomes[0].activities);assert.equal(place.canonical_lore.homeId,homes[0].id);
      await assert.rejects(db.query('select * from kivelle_ensure_home_location($1,$2)',[otherUser,instance.id]),/Home unavailable/);
    });
    await t.test('visits consume zero private-place slots and cannot forge quota exemptions',async()=>{
      await db.exec('create trigger private_limit before insert or update on together_locations for each row execute function kivelle_limit_private_places();');
      await seed(db,'together_entitlements',{user_id:user,tier:'free'});
      for(let n=0;n<3;n++)await seed(db,'together_locations',{id:id(),world_id:world.id,owner_user_id:user,name:`My place ${n}`,slug:`mine-${n}`});
      await assert.rejects(seed(db,'together_locations',{id:id(),world_id:world.id,owner_user_id:user,name:'Fourth',slug:'fourth'}),/Private place limit reached/);
      await db.exec('grant usage on schema public,auth to authenticated;grant insert,update,delete,select on together_locations to authenticated;');
      await db.exec('set role authenticated');
      await assert.rejects(db.query('update together_locations set name=$1 where id=$2',['Edited',place.id]),/managed by the server/);
      await assert.rejects(db.query('delete from together_locations where id=$1',[place.id]),/managed by the server/);
      await assert.rejects(db.query('select kivelle_ensure_home_location($1,$2)',[user,instance.id]),/permission denied/);
      await assert.rejects(db.query('select * from together_home_artwork'),/permission denied/);
      await db.exec('reset role');
    });
    await t.test('approval refreshes only environment reference, preserving image history',async()=>{
      const job=(await db.query('select * from together_home_artwork where home_id=$1',[homes[0].id])).rows[0];
      await db.query("update together_home_artwork set status='ready',storage_path='first.jpg',width=1536,height=1024 where id=$1",[job.id]);
      await db.query('update together_character_homes set approved_artwork_id=$1 where id=$2',[job.id,homes[0].id]);
      const refreshed=(await db.query('select * from kivelle_ensure_home_location($1,$2)',[user,instance.id])).rows[0];
      assert.equal(refreshed.metadata.artworkPath,'first.jpg');
      assert.equal((await db.query('select asset_role from together_media_reference_assets')).rows[0].asset_role,'location_canonical');
      await db.query('select * from kivelle_ensure_home_location($1,$2)',[user,instance.id]);
      assert.equal((await db.query('select count(*)::int n from together_media_reference_assets')).rows[0].n,1);
      await db.query("insert into together_home_artwork(home_id,prompt_text) values($1,'new direction')",[homes[0].id]);
      await assert.rejects(db.query("insert into together_home_artwork(home_id,prompt_text) values($1,'duplicate')",[homes[0].id]),/unique/);
      assert.equal((await db.query('select count(*)::int n from together_home_artwork where home_id=$1',[homes[0].id])).rows[0].n,2);
      const second=(await db.query("update together_home_artwork set status='ready',storage_path='second.webp',width=1536,height=1024 where home_id=$1 and status='queued' returning id",[homes[0].id])).rows[0];
      await db.query('update together_character_homes set approved_artwork_id=$1 where id=$2',[second.id,homes[0].id]);
      await db.query('select * from kivelle_ensure_home_location($1,$2)',[user,instance.id]);
      assert.equal((await db.query("select count(*)::int n from together_media_reference_assets where active")).rows[0].n,1);
      assert.equal((await db.query("select content_type from together_media_reference_assets where active")).rows[0].content_type,'image/webp');
      await seed(db,'together_profiles',{user_id:otherUser,active_continuity_id:life});
      const secondInstance=await seed(db,'together_character_instances',{id:id(),user_id:otherUser,continuity_id:life,character_version_id:homes[0].character_version_id});
      const secondPlace=(await db.query('select * from kivelle_ensure_home_location($1,$2)',[otherUser,secondInstance.id])).rows[0];
      assert.notEqual(secondPlace.id,place.id);
      assert.equal(secondPlace.metadata.artworkPath,'second.webp');
      await db.query('update together_character_homes set approved_artwork_id=$1 where id=$2',[job.id,homes[0].id]);
      await db.query('select * from kivelle_ensure_home_location($1,$2)',[user,instance.id]);
      assert.equal((await db.query('select count(*)::int n from together_media_reference_assets where location_id=$1',[place.id])).rows[0].n,2,'restoring reuses immutable reference history');
      assert.equal((await db.query('select storage_path from together_media_reference_assets where location_id=$1 and active',[place.id])).rows[0].storage_path,'first.jpg');
    });
    await t.test('invitations require an active turn and atomically enforce cooldowns',async()=>{
      const conversation=await seed(db,'together_conversations',{id:id(),user_id:user,character_instance_id:instance.id,continuity_id:life});
      const userMessage=await seed(db,'together_messages',{id:id(),user_id:user,conversation_id:conversation.id,role:'user',content:'How is your evening?'});
      const assistant=await seed(db,'together_messages',{id:id(),user_id:user,conversation_id:conversation.id,role:'assistant',content:'Quiet. Just making coffee.'});
      const args=[user,instance.id,conversation.id,userMessage.id,assistant.id,homes[0].id,'have_coffee',new Date(Date.now()+3600000).toISOString(),{locationId:place.id,activityKey:'have_coffee'}];
      const offer=()=>db.query('select kivelle_offer_home_visit($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',args);
      args[5]=homes[1].id;assert.equal((await offer()).rows[0].id,null,'cannot invite to another companion’s home');args[5]=homes[0].id;
      args[4]=userMessage.id;assert.equal((await offer()).rows[0].id,null,'requires the actual companion response');args[4]=assistant.id;
      assert.ok((await offer()).rows[0].id);assert.equal((await offer()).rows[0].id,null);
      assert.equal((await db.query('select count(*)::int n from together_conversation_actions')).rows[0].n,1);
      await db.query("update together_conversation_actions set status='dismissed'");
      await db.query("update together_home_invitations set created_at=now()-interval '8 days'");
      assert.equal((await offer()).rows[0].id,null,'same activity waits 30 days');
      args[6]='cook_together';assert.ok((await offer()).rows[0].id,'different activity after 7 days');
      await db.query("update together_conversation_actions set status='dismissed'");
      await db.query("update together_home_invitations set created_at=now()-interval '31 days'");
      await db.query("update together_messages set created_at=now()-interval '3 minutes' where id=$1",[userMessage.id]);
      assert.equal((await offer()).rows[0].id,null,'background processing cannot create a new invitation');
    });
  }finally{await db.close();}
});
