begin;
select plan(4);

select is((
  select count(*)::integer
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug in('mirelle-voss','vivienne-blackwood')
    and version.version=template.current_published_version
    and version.character_bible->'selfKnowledge'->>'nature'='vampire'
    and version.character_bible->'selfKnowledge'->>'certainty'='absolute'
),2,'Mirelle and Vivienne consciously know that they are vampires');

select ok(not exists(
  select 1
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug in('mirelle-voss','vivienne-blackwood')
    and version.version=template.current_published_version
    and coalesce(version.character_bible->'selfKnowledge'->>'awareness','')=''
),'Both companions have explicit internal awareness rather than an inferred label');

select ok(not exists(
  select 1
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug not in('mirelle-voss','vivienne-blackwood')
    and version.character_bible->'selfKnowledge'->>'nature'='vampire'
),'No other companion was reclassified through private self-knowledge');

select ok(not exists(
  select 1
  from public.together_character_templates
  where slug in('mirelle-voss','vivienne-blackwood')
    and discovery_metadata->>'classification'<>'long_lived_veiled'
),'Their public profile classification remains unchanged');

select * from finish();
rollback;
