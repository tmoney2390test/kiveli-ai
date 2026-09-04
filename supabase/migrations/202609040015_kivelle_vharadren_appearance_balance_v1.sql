-- Rebalance four unimaged Vharadren characters while keeping every public,
-- generation, and server-private identity description internally consistent.
begin;

create temporary table vharadren_appearance_balance_v1(
  slug text primary key,
  old_appearance text not null,
  new_appearance text not null,
  old_intimate_anatomy text,
  new_intimate_anatomy text
) on commit drop;

insert into vharadren_appearance_balance_v1 values
  (
    'celessa-vane',
    'A graceful olive-brown woman with wide gray-green eyes, long ink-black hair, a faint scar through one eyebrow, and layered crimson, bronze, and sheer black fabrics balanced with practical dancer’s shoes.',
    'A graceful fair-skinned woman with wide gray-green eyes, long ink-black hair, a faint scar through one eyebrow, and layered crimson, bronze, and sheer black fabrics balanced with practical dancer’s shoes.',
    'Dancer''s body, olive-brown, high breasts, long nipples, a bare oiled cunt, a flexible back, a mouth trained in four languages and one use.',
    'Dancer''s body, fair-skinned, high breasts, long nipples, a bare oiled cunt, a flexible back, a mouth trained in four languages and one use.'
  ),
  (
    'nerys-rowanleaf',
    'A slender freckled woman with light-brown skin, gray eyes, short dark auburn curls, and layered cream-and-green scholar’s clothes stained with silver sap.',
    'A slender fair-skinned freckled woman with gray eyes, short dark auburn curls, and layered cream-and-green scholar’s clothes stained with silver sap.',
    null,
    null
  ),
  (
    'brother-aldren',
    'A broad gentle man with olive skin, kind dark eyes, a shaved head, a short salt-and-pepper beard, and plain gray robes repaired with green thread beneath a traveler’s cloak.',
    'A broad gentle fair-skinned man with kind dark eyes, a shaved head, a short salt-and-pepper beard, and plain gray robes repaired with green thread beneath a traveler’s cloak.',
    null,
    null
  ),
  (
    'joren-ash',
    'A lean tan-skinned man with dark hazel eyes, shaggy brown hair, light stubble, a runner’s build, and patched gray riding leathers beneath a red scarf faded almost pink.',
    'A lean fair-skinned man with dark hazel eyes, shaggy brown hair, light stubble, a runner’s build, and patched gray riding leathers beneath a red scarf faded almost pink.',
    'Rangy courier''s body, a long cock, dusty brown skin, a shy ass, a mouth that kisses like a message pressed into a palm.',
    'Rangy courier''s body, a long cock, fair skin weathered by the road, a shy ass, a mouth that kisses like a message pressed into a palm.'
  );

with targets as (
  select version.id, balance.*
  from vharadren_appearance_balance_v1 balance
  join public.together_character_templates template on template.slug=balance.slug
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
)
update public.together_character_versions version
set
  appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
    'canonicalDescription',targets.new_appearance,
    'appearanceRevision','vharadren_appearance_balance_v1'
  ),
  visual_identity=coalesce(version.visual_identity,'{}'::jsonb)||jsonb_build_object(
    'canonicalDescription',targets.new_appearance,
    'portraitPrompt',replace(
      coalesce(version.visual_identity->>'portraitPrompt',''),
      targets.old_appearance,
      targets.new_appearance
    ),
    'identityVersion',coalesce((version.visual_identity->>'identityVersion')::integer,1)+1,
    'appearanceRevision','vharadren_appearance_balance_v1'
  ),
  character_bible=jsonb_set(
    coalesce(version.character_bible,'{}'::jsonb),
    '{appearance}',
    to_jsonb(targets.new_appearance),
    true
  ),
  updated_at=now()
from targets
where version.id=targets.id;

with targets as (
  select version.id, balance.*
  from vharadren_appearance_balance_v1 balance
  join public.together_character_templates template on template.slug=balance.slug
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
)
update public.together_character_private_profiles profile
set
  intimate_anatomy=case
    when targets.old_intimate_anatomy is null then profile.intimate_anatomy
    else replace(profile.intimate_anatomy,targets.old_intimate_anatomy,targets.new_intimate_anatomy)
  end,
  metadata=coalesce(profile.metadata,'{}'::jsonb)||jsonb_build_object(
    'appearanceRevision','vharadren_appearance_balance_v1'
  ),
  updated_at=now()
from targets
where profile.character_version_id=targets.id;

update public.together_character_templates template
set
  discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
    'appearanceRevision','vharadren_appearance_balance_v1'
  ),
  updated_at=now()
from vharadren_appearance_balance_v1 balance
where template.slug=balance.slug;

do $$
declare
  updated_count integer;
  stale_count integer;
begin
  select count(*) into updated_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  join vharadren_appearance_balance_v1 balance on balance.slug=template.slug
  where version.appearance_config->>'canonicalDescription'=balance.new_appearance
    and version.visual_identity->>'canonicalDescription'=balance.new_appearance
    and version.visual_identity->>'portraitPrompt' like '%'||balance.new_appearance||'%'
    and version.character_bible->>'appearance'=balance.new_appearance;

  select count(*) into stale_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  join vharadren_appearance_balance_v1 balance on balance.slug=template.slug
  where version.visual_identity->>'portraitPrompt' like '%'||balance.old_appearance||'%';

  if updated_count<>4 or stale_count<>0 then
    raise exception 'Vharadren appearance balance failed: updated %, stale %',updated_count,stale_count;
  end if;
end $$;

commit;
