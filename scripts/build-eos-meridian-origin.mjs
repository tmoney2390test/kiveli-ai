import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { WORLD_ID, world, worldFacts, originStoryFacts } from './eos-meridian-content.mjs';

export const migrationPath='supabase/migrations/20260928002045_eos_meridian_origin_story.sql';

export function renderOriginMigration(){
  const payload={story:world.canonicalLore.originStory,facts:originStoryFacts,factCount:worldFacts.length};
  return `-- Add the public Eos origin story without changing character, relationship, or player state.
begin;

do $$ begin
  if not exists (select 1 from public.together_worlds where id='${WORLD_ID}'::uuid) then
    raise exception 'Eos Meridian must exist before applying its origin story';
  end if;
end $$;

create temporary table eos_origin_payload(data jsonb) on commit drop;
insert into eos_origin_payload values ($eos_origin$${JSON.stringify(payload)}$eos_origin$::jsonb);

update public.together_worlds as world
set metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
      'canonicalLore',coalesce(world.metadata->'canonicalLore','{}'::jsonb)||jsonb_build_object('originStory',payload.data->'story'),
      'worldFactCount',(payload.data->>'factCount')::integer
    ),
    updated_at=now()
from eos_origin_payload as payload
where world.id='${WORLD_ID}'::uuid;

insert into public.together_world_facts as existing
  (world_id,slug,title,fact_text,category,truth_mode,knowledge_scope,content_level,
   topic_tags,trigger_terms,weight,cooldown_turns,active,metadata)
select '${WORLD_ID}'::uuid,item->>'slug',item->>'title',item->>'fact',item->>'category',
       item->>'truthMode',item->>'knowledgeScope',item->>'contentLevel',
       array['eos-meridian','founding',item->>'category'],
       array(select jsonb_array_elements_text(item->'triggerTerms')),
       1,24,true,jsonb_build_object('source','eos_origin_story_v1')
from eos_origin_payload as payload
cross join lateral jsonb_array_elements(payload.data->'facts') as item
on conflict(world_id,slug) do update
set title=excluded.title,fact_text=excluded.fact_text,
    trigger_terms=excluded.trigger_terms,updated_at=now()
where existing.metadata->>'source'='eos_origin_story_v1';

commit;
`;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await writeFile(migrationPath,renderOriginMigration());
  console.log(`Generated ${migrationPath}`);
}
