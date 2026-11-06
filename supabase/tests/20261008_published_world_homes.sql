begin;
select plan(10);

select is((
  select count(*)::integer
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where world.published and home.active and world.slug<>'juniper-city'
    and home.residence_type ilike '%Juniper City%'
),0,'No published non-Juniper world has a Juniper City residence type');

select is((
  select count(*)::integer
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where world.slug='eos-meridian' and home.active
    and (home.description ilike '%Juniper City apartment%'
      or home.prompt_text ilike '%Juniper City apartment%')
),0,'Eos home copy and image prompts do not describe Juniper apartments');

with generated as (
  select world.slug,public.kivelle_default_character_home_profile(
    home.character_version_id,home.world_id,home.district_anchor_location_id
  ) as profile
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where home.active and home.source='auto'
    and world.slug in ('calders-run','gilded-coast','northvale','vespormoor','vharadren')
)
select is(count(*) filter (where profile->>'residenceType' ilike '%Juniper City%')::integer,0,
  'Future homes in the five later worlds use their own world vocabulary') from generated;

with generated as (
  select public.kivelle_default_character_home_profile(
    home.character_version_id,home.world_id,home.district_anchor_location_id
  ) as profile
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where home.active and home.source='auto' and world.published
)
select is(count(*) filter (where length(btrim(profile->>'description'))<120
  or length(btrim(profile->>'promptText'))<300)::integer,0,
  'Generated homes satisfy the database description and prompt lengths') from generated;

select ok(exists (
  select 1 from public.together_character_homes home
  join public.together_character_versions version on version.id=home.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where template.slug='hana-petrov' and home.description ilike '%Rain Room%'
    and home.description not ilike '%Juniper City%'
),'Hana’s home is distinct from her public swimming location');

select is((
  select count(*)::integer
  from public.together_character_world_presence presence
  join public.together_worlds world on world.id=presence.world_id
  join public.together_locations location on location.id=presence.home_location_id
  where world.slug='port-vervelle' and presence.presence_type='resident'
    and location.location_type='landmark'
),0,'Port Vervelle residents no longer use the public marina as their home');

select ok(exists (
  select 1
  from public.together_character_homes home
  join public.together_character_versions version on version.id=home.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  join public.together_locations district on district.id=home.district_anchor_location_id
  where template.slug='isadora-vescari' and district.slug='porto-vecchio'
    and home.prompt_text ilike '%Wreck diver%'
),'Repairing the marina anchor preserves Isadora’s character-specific image prompt');

select is((
  select count(*)::integer from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where world.published and home.active
    and home.description ilike '%details stay ordinary and lived-in.%'
),0,'Published home descriptions have no mechanical occupation fragment');

select is((
  select count(*)::integer from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where world.slug='eos-meridian' and home.active
    and (home.description ilike '%conversation is open%'
      or home.description ilike '%A chat does not place anyone inside%')
),0,'Eos home descriptions use reader-facing language');

with generated as (
  select public.kivelle_default_character_home_profile(
    home.character_version_id,home.world_id,home.district_anchor_location_id
  ) as profile
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where world.slug='eos-meridian' and home.active and home.source='auto'
)
select is(count(*) filter (where profile->>'description' ilike '%conversation is open%'
  or profile->>'description' ilike '%A chat does not place anyone inside%')::integer,0,
  'New Eos home profiles keep reader-facing descriptions') from generated;

select * from finish();
rollback;
