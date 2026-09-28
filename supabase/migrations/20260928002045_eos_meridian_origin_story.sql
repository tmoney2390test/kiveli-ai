-- Add the public Eos origin story without changing character, relationship, or player state.
begin;

do $$ begin
  if not exists (select 1 from public.together_worlds where id='10000000-0000-4000-8000-000000000012'::uuid) then
    raise exception 'Eos Meridian must exist before applying its origin story';
  end if;
end $$;

create temporary table eos_origin_payload(data jsonb) on commit drop;
insert into eos_origin_payload values ($eos_origin${"story":"Thirty-eight years ago, the Meridian Expedition landed on the narrow twilight boundary between Eos’s permanent day and permanent night. The first habitats were designed for six hundred people doing temporary work, not for a permanent city.\n\nSeventeen hours are absent from the certified landing record. It ends before touchdown and resumes with First Habitat already pressurized. The gap has no official explanation and does not establish what happened within it.\n\nMeridian became permanent through ordinary decisions rather than one founding declaration: a growing cycle worth finishing, repairs worth keeping, and households whose children knew Eos as home. Temporary modules grew into six districts while the original corridors remained lived in.\n\nThe Founding Charter offered local control once residents could purchase and maintain the life-support network. Axiom’s backing helped the settlement survive, but the cost of independence became a lasting political dispute. The Habitat Lyra emergency and charter renewal in Year 20 were a later, separate crisis, not an explanation for the missing landing hours.\n\nIn Year 38, the colony faces an independence vote. Its residents can disagree about why their predecessors stayed while deciding together who should control the home they built.","facts":[{"slug":"eos-temporary-expedition","title":"A Temporary Beginning","category":"history","fact":"The Year 0 Meridian Expedition built habitats for six hundred temporary residents at Eos’s twilight boundary, not a permanent city.","triggerTerms":["origin","founding","founded","landing","expedition","temporary"],"truthMode":"canonical","knowledgeScope":"public","contentLevel":"standard"},{"slug":"eos-becoming-home","title":"How Meridian Became Home","category":"history","fact":"Meridian became permanent through growing cycles, indispensable repairs, and households raising children on Eos, rather than one founding vote.","triggerTerms":["stay","stayed","settled","home","permanent","generation"],"truthMode":"canonical","knowledgeScope":"public","contentLevel":"standard"},{"slug":"eos-charter-and-lyra","title":"The Charter and Lyra","category":"history","fact":"Axiom’s charter ties local control to buying and maintaining life support. The Year 20 Lyra emergency and renewal are separate from the Year 0 landing gap.","triggerTerms":["charter","axiom","lyra","independence","missing hours"],"truthMode":"canonical","knowledgeScope":"public","contentLevel":"standard"}],"factCount":40}$eos_origin$::jsonb);

update public.together_worlds as world
set metadata=coalesce(world.metadata,'{}'::jsonb)||jsonb_build_object(
      'canonicalLore',coalesce(world.metadata->'canonicalLore','{}'::jsonb)||jsonb_build_object('originStory',payload.data->'story'),
      'worldFactCount',(payload.data->>'factCount')::integer
    ),
    updated_at=now()
from eos_origin_payload as payload
where world.id='10000000-0000-4000-8000-000000000012'::uuid;

insert into public.together_world_facts as existing
  (world_id,slug,title,fact_text,category,truth_mode,knowledge_scope,content_level,
   topic_tags,trigger_terms,weight,cooldown_turns,active,metadata)
select '10000000-0000-4000-8000-000000000012'::uuid,item->>'slug',item->>'title',item->>'fact',item->>'category',
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
