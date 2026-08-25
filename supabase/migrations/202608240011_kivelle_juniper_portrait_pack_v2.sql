-- Connect the supplied Juniper City portrait pack to the canonical character
-- versions. Profile-gallery extras remain packaged client assets; the main
-- portraits are also synchronized into together_media_reference_assets.
with portrait_pack(slug) as (
  values
    ('noah-williams'),
    ('daniel-kim'),
    ('gabriel-ortiz'),
    ('malcolm-reed'),
    ('javier-morales'),
    ('vincent-hale'),
    ('omar-haddad'),
    ('caleb-bennett'),
    ('reese-morgan'),
    ('leila-rahman'),
    ('naomi-chen')
)
update public.together_character_templates template
set discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)
      ||jsonb_build_object(
        'portraitStatus','ready',
        'portraitAssetKey',template.slug,
        'portraitSource','authored_packaged_asset',
        'portraitPack','juniper_portrait_pack_v2'
      ),
    updated_at=now()
from portrait_pack
where template.slug=portrait_pack.slug;

with portrait_pack(slug) as (
  values
    ('noah-williams'),
    ('daniel-kim'),
    ('gabriel-ortiz'),
    ('malcolm-reed'),
    ('javier-morales'),
    ('vincent-hale'),
    ('omar-haddad'),
    ('caleb-bennett'),
    ('reese-morgan'),
    ('leila-rahman'),
    ('naomi-chen')
)
update public.together_character_versions version
set portrait_asset_key=template.slug,
    appearance_config=coalesce(version.appearance_config,'{}'::jsonb)
      ||jsonb_build_object(
        'photoStatus','ready',
        'portraitStatus','ready',
        'asset',template.slug,
        'portraitPack','juniper_portrait_pack_v2'
      ),
    visual_identity=coalesce(version.visual_identity,'{}'::jsonb)
      ||jsonb_build_object(
        'status','reference_ready',
        'portraitAssetKey',template.slug,
        'portraitPack','juniper_portrait_pack_v2'
      ),
    updated_at=now()
from public.together_character_templates template
join portrait_pack on portrait_pack.slug=template.slug
where version.character_template_id=template.id
  and version.version=template.current_published_version;

with portrait_pack(slug) as (
  values
    ('noah-williams'),
    ('daniel-kim'),
    ('gabriel-ortiz'),
    ('malcolm-reed'),
    ('javier-morales'),
    ('vincent-hale'),
    ('omar-haddad'),
    ('caleb-bennett'),
    ('reese-morgan'),
    ('leila-rahman'),
    ('naomi-chen')
)
update public.together_character_world_presence presence
set metadata=coalesce(presence.metadata,'{}'::jsonb)
      ||jsonb_build_object(
        'portraitStatus','ready',
        'portraitAssetKey',template.slug,
        'portraitPack','juniper_portrait_pack_v2'
      ),
    updated_at=now()
from public.together_character_versions version
join public.together_character_templates template
  on template.id=version.character_template_id
join portrait_pack on portrait_pack.slug=template.slug
where presence.character_version_id=version.id
  and presence.world_id='10000000-0000-4000-8000-000000000001'::uuid;

do $$
declare
  ready_count integer;
begin
  select count(*)
    into ready_count
    from public.together_character_templates template
    join public.together_character_versions version
      on version.character_template_id=template.id
     and version.version=template.current_published_version
   where template.slug=any(array[
     'noah-williams','daniel-kim','gabriel-ortiz','malcolm-reed',
     'javier-morales','vincent-hale','omar-haddad','caleb-bennett',
     'reese-morgan','leila-rahman','naomi-chen'
   ]::text[])
     and version.portrait_asset_key=template.slug;

  if ready_count<>11 then
    raise exception 'Juniper portrait pack expected 11 canonical characters, found %',ready_count;
  end if;
end
$$;
