begin;

-- Sexual backstory for Princess Maris Vaelorian and Celia Thatch.
-- Public biographies, occupations, and ages are unchanged. Intimate fields
-- stay on the private profile and gated character_bible keys.

create temporary table kivelle_maris_celia_intimacy(
  slug text primary key,
  hidden_sexual text not null,
  intimate_anatomy text not null
) on commit drop;

insert into kivelle_maris_celia_intimacy(slug, hidden_sexual, intimate_anatomy) values
(
  'princess-maris-vaelorian',
  'She is an adult with a private appetite, not a mascot of innocence and not a prize for the crown. Behind the petition table she thinks about being kissed until the braid comes down, talked to like Maris, and touched under the court gown when the door is locked. She wants the high neck unfastened by someone who asked for her, not the title. She will not be rushed, inventoried, or treated as a lesson. Duty, rescue, and rank are not how she gets into bed.',
  'A slender adult body, ash-blonde hair, freckles at the throat that show when the gown is off, a mouth she is still learning to use without court manners, skin that flushes when she is kissed too long.'
),
(
  'celia-thatch',
  'She is an adult with a private appetite, not a mascot of innocence. After the stall is packed she wants to be kissed stupid, hands under the apron, heat that has nothing to do with the oven. She thinks about it walking the Gilded Steps with flour still on her knuckles, wanting someone who wants the baker''s daughter and not a palace door. Bread, coin, and protection are not how she gets into bed.',
  'A sturdy adult body, chestnut braid, weather-reddened freckles, flour on her wrists, a mouth that stays warm after work, breasts she is less shy about than court girls assume.'
);

update public.together_character_private_profiles as profile
set
  hidden_sexual=intimacy.hidden_sexual,
  intimate_anatomy=intimacy.intimate_anatomy,
  adult_continuity='Hidden sexual life and intimate anatomy are private. Use them only in eligible adult intimacy; never as public biography, portrait direction, or a lecture.',
  updated_at=now()
from public.together_character_templates as template
join public.together_character_versions as version
  on version.character_template_id=template.id
 and version.version=template.current_published_version
join kivelle_maris_celia_intimacy as intimacy on intimacy.slug=template.slug
where profile.character_version_id=version.id;

update public.together_character_versions as version
set character_bible=jsonb_set(
      jsonb_set(
        coalesce(version.character_bible,'{}'::jsonb)||jsonb_build_object(
          'hiddenSexual',intimacy.hidden_sexual,
          'intimateAnatomy',intimacy.intimate_anatomy
        ),
        '{anecdotes}',
        (
          select coalesce(jsonb_agg(elem),'[]'::jsonb)
          from (
            select elem
            from jsonb_array_elements(coalesce(version.character_bible->'anecdotes','[]'::jsonb)) as elem
            where coalesce(elem->>'id','') not like '%-intimate'
            union all
            select jsonb_build_object(
              'id',template.slug||'-intimate',
              'title','The body kept back',
              'summary',intimacy.hidden_sexual,
              'topics',jsonb_build_array('secret','desire','intimacy'),
              'revealStages',jsonb_build_array('flirting','dating','exclusive','long_term'),
              'minimumTrust',55,
              'cooldownTurns',70
            )
          ) as combined(elem)
        )
      ),
      '{adultContinuity}',
      to_jsonb('Hidden sexual life and intimate anatomy are private. Use them only in eligible adult intimacy; never as public biography, portrait direction, or a lecture.'::text)
    ),
    updated_at=now()
from public.together_character_templates as template
join kivelle_maris_celia_intimacy as intimacy on intimacy.slug=template.slug
where version.character_template_id=template.id
  and version.version=template.current_published_version;

do $$
declare updated_count integer;
begin
  select count(*) into updated_count
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id
   and version.version=template.current_published_version
  join public.together_character_private_profiles profile
    on profile.character_version_id=version.id
  where template.slug in('princess-maris-vaelorian','celia-thatch')
    and length(profile.hidden_sexual)>80
    and length(profile.intimate_anatomy)>40
    and coalesce(version.character_bible->>'hiddenSexual','')<>'';
  if updated_count<>2 then
    raise exception 'Maris/Celia intimacy update failed: updated %', updated_count;
  end if;
end $$;

commit;
