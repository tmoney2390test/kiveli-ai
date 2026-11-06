import {readFile,writeFile} from 'node:fs/promises';
import {eosHomes} from '../content/homes/eos-meridian.mjs';
const file = new URL('../supabase/migrations/20261105200017_character_home_visits_pilot.sql',import.meta.url);
const marker='-- BEGIN AUTHORED EOS HOMES';
const original=await readFile(file,'utf8');
const base=original.split(marker)[0].replace(/\s*commit;\s*$/,'');
const quote=(value)=>`'${String(value).replaceAll("'","''")}'`;
const payload=JSON.stringify(eosHomes);
const sql=`
${marker}
do $homes$
declare item jsonb; affected integer;
begin
  for item in select * from jsonb_array_elements(${quote(payload)}::jsonb) loop
    update public.together_character_homes h set name=item->>'name',description=item->>'description',
      residence_type='private colony residence',prompt_text=item->>'prompt',
      personal_details=item->'details',possible_activities=array(select jsonb_array_elements_text(item->'activities')),
      visits_enabled=true,reference_policy='optional',source='authored',prompt_version=h.prompt_version+1,
      canonical_visual_context=h.canonical_visual_context||jsonb_build_object('indoorOutdoor','indoor','environmentReferencePolicy','optional','architecture',jsonb_build_array('pressurized colony residence',item->>'description'),'windowOutlook',item->>'windowOutlook','interiorStyle',item->>'interiorStyle','recurringObjects',(select jsonb_agg(detail->>'description') from jsonb_array_elements(item->'details') detail),'canonicalPrompt',item->>'prompt'),
      canonical_lore=jsonb_build_object('summary',item->>'description','personalDetails',item->'details','windowOutlook',item->>'windowOutlook','interiorStyle',item->>'interiorStyle','stableFacts',jsonb_build_array('This is a private home, separate from public work and recreation areas.','The user is only physically here during an accepted, active home visit.','Personal objects do not imply new relatives, pets, roommates, or past events.',item->>'windowOutlook',item->>'interiorStyle')),updated_at=now()
    from public.together_character_versions v,public.together_character_templates t,public.together_worlds w
    where h.character_version_id=v.id and v.character_template_id=t.id and t.slug=item->>'slug'
      and h.world_id=w.id and w.slug='eos-meridian' and t.creator_id is null;
    get diagnostics affected=row_count;
    if affected=0 then raise exception 'Missing Eos home for %',item->>'slug'; end if;
  end loop;
end $homes$;
-- One controlled generation job per current pilot home. Navigation never queues artwork.
insert into public.together_home_artwork(home_id,prompt_text)
select h.id,h.prompt_text from public.together_character_homes h
join public.together_character_versions v on v.id=h.character_version_id
join public.together_character_templates t on t.id=v.character_template_id and t.current_published_version=v.version
join public.together_worlds w on w.id=h.world_id
where h.visits_enabled and h.active and w.slug='eos-meridian' and h.approved_artwork_id is null
on conflict(home_id) where status in ('queued','generating') do nothing;
commit;
`;
await writeFile(file,`${base}\n${sql}`);
console.log(`Authored ${eosHomes.length} Eos homes; other worlds remain disabled.`);
