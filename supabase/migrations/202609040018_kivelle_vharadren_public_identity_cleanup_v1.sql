-- Keep public portrait identity fields useful for consistent generation while
-- leaving mature continuity exclusively in the server-private profile.
begin;

create temporary table vharadren_public_identity_cleanup_v1(
  slug text primary key,
  old_background text,
  new_background text,
  old_appearance text,
  new_appearance text
) on commit drop;

insert into vharadren_public_identity_cleanup_v1 values
  (
    'delphine-lantern',
    null,
    null,
    'A mature curvy Black woman with mahogany skin, dark amber eyes, long braided hair gathered over one shoulder, and rich green-and-copper gowns with sleeves designed to conceal keys and signal ribbons.',
    'A mature curvy mahogany-skinned woman with dark amber eyes, long braided hair gathered over one shoulder, and rich green-and-copper gowns with sleeves designed to conceal keys and signal ribbons.'
  ),
  (
    'bastian-crow',
    'Guildmarked Black coastal shipwright',
    'Guildmarked coastal shipwright from an old Shattered Coast dock family',
    null,
    null
  ),
  (
    'nessa-honeybell-marrow',
    null,
    null,
    'A lush young woman with warm gold-brown skin, heavy honey-blond ringlets, sticky-amber eyes, a dancer’s waist over a full ass and very full breasts; she works in wine-dark silk cut to the nipple and a honeybell charm at her throat.',
    'A lush, curvy adult woman with warm gold-brown skin, heavy honey-blond ringlets, amber eyes, and a dancer’s poise; she wears wine-dark silk with a tasteful structured neckline and a honeybell charm at her throat.'
  ),
  (
    'catrin-brann',
    null,
    null,
    'A thick, fair, farm-strong woman with a heavy braid the color of ale, a gap-toothed grin, big milk-pale breasts, and red camp skirts she hikes without ceremony; a reed tattoo sits low on her belly where a lover’s mouth can find it.',
    'A sturdy fair-skinned, farm-strong woman with a heavy braid the color of ale, a gap-toothed grin, and layered red camp skirts over practical linen, worn with an easy lack of ceremony.'
  ),
  (
    'vespera-saan',
    null,
    null,
    'A poised bronze woman with black hair oiled into a high coil, gold-dusted lids, a gold waist-chain over sheer crimson, and small gold rings in both nipples visible when she chooses the open jacket; dancer’s feet, unhurried hands.',
    'A poised bronze-skinned woman with black hair oiled into a high coil, gold-dusted lids, a dancer’s posture, and a fitted crimson court ensemble with a gold waist-chain and structured open jacket over an opaque bodice; her movements are precise and unhurried.'
  );

with targets as (
  select version.id, cleanup.*
  from vharadren_public_identity_cleanup_v1 cleanup
  join public.together_character_templates template on template.slug=cleanup.slug
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
)
update public.together_character_versions version
set
  appearance_config=coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
    'canonicalDescription',coalesce(targets.new_appearance,version.appearance_config->>'canonicalDescription'),
    'background',coalesce(targets.new_background,version.appearance_config->>'background'),
    'publicIdentityRevision','vharadren_public_identity_cleanup_v1'
  ),
  visual_identity=coalesce(version.visual_identity,'{}'::jsonb)||jsonb_build_object(
    'canonicalDescription',coalesce(targets.new_appearance,version.visual_identity->>'canonicalDescription'),
    'portraitPrompt',case
      when targets.old_appearance is null then version.visual_identity->>'portraitPrompt'
      else replace(version.visual_identity->>'portraitPrompt',targets.old_appearance,targets.new_appearance)
    end,
    'visualDoNotChange',case
      when targets.old_background is null then coalesce(version.visual_identity->'visualDoNotChange','[]'::jsonb)
      else coalesce((
        select jsonb_agg(
          case
            when constraint_value#>>'{}'='background: '||targets.old_background
              then to_jsonb('background: '||targets.new_background)
            else constraint_value
          end
          order by constraint_index
        )
        from jsonb_array_elements(coalesce(version.visual_identity->'visualDoNotChange','[]'::jsonb))
          with ordinality as constraints(constraint_value,constraint_index)
      ),'[]'::jsonb)
    end,
    'identityVersion',coalesce((version.visual_identity->>'identityVersion')::integer,1)+1,
    'publicIdentityRevision','vharadren_public_identity_cleanup_v1'
  ),
  character_bible=coalesce(version.character_bible,'{}'::jsonb)||jsonb_build_object(
    'appearance',coalesce(targets.new_appearance,version.character_bible->>'appearance'),
    'background',coalesce(targets.new_background,version.character_bible->>'background')
  ),
  updated_at=now()
from targets
where version.id=targets.id;

update public.together_character_templates template
set
  discovery_metadata=coalesce(template.discovery_metadata,'{}'::jsonb)||jsonb_build_object(
    'background',coalesce(cleanup.new_background,template.discovery_metadata->>'background'),
    'publicIdentityRevision','vharadren_public_identity_cleanup_v1'
  ),
  updated_at=now()
from vharadren_public_identity_cleanup_v1 cleanup
where template.slug=cleanup.slug;

do $$
declare
  revised_count integer;
  public_leak_count integer;
begin
  select count(*) into revised_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  join vharadren_public_identity_cleanup_v1 cleanup on cleanup.slug=template.slug
  where version.visual_identity->>'publicIdentityRevision'='vharadren_public_identity_cleanup_v1'
    and version.appearance_config->>'publicIdentityRevision'='vharadren_public_identity_cleanup_v1'
    and(cleanup.new_appearance is null or version.visual_identity->>'canonicalDescription'=cleanup.new_appearance)
    and(cleanup.new_background is null or template.discovery_metadata->>'background'=cleanup.new_background);

  select count(*) into public_leak_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  where template.slug in('nessa-honeybell-marrow','catrin-brann','vespera-saan')
    and lower(coalesce(version.visual_identity->>'portraitPrompt','')) similar to '%(nipple|breast|cunt|pussy|genital|nude)%';

  if revised_count<>5 or public_leak_count<>0 then
    raise exception 'Vharadren public identity cleanup failed: revised %, public leaks %',revised_count,public_leak_count;
  end if;
end $$;

commit;
