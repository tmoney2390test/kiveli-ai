-- Replace imported relationship placeholders with readable, conservative
-- descriptions. Keep specific authored histories, relationship types, and
-- knowledge boundaries intact. No private Life data is touched.
begin;

with candidates as (
  select e.id, e.history, e.relationship_type, e.metadata,
    source.name as source_name, target.name as target_name,
    world.name as world_name,
    ascii(substr(md5(e.id::text), 1, 1)) % 5 as variation,
    case e.metadata->>'circle'
      when 'creative-night' then 'Juniper''s music and late-night scene'
      when 'college-green' then 'the college crowd'
      when 'riverside-regulars' then 'the riverfront'
      when 'paper-trail' then 'Juniper''s bookshops and galleries'
      when 'civic-city' then 'city projects'
      when 'station-night' then 'the station'
      when 'meridian-crew' then 'training and recovery work'
      when 'responders' then 'medical and emergency work'
      when 'market-table' then 'the market'
      else 'Juniper City'
    end as juniper_setting,
    initcap(replace(split_part(split_part(e.history, 'through ', 2), ',', 1), '-', ' ')) as vharadren_district
  from public.together_character_relationship_edges e
  join public.together_character_templates source on source.id = e.source_template_id
  join public.together_character_templates target on target.id = e.target_template_id
  join public.together_worlds world on world.id = e.world_id
  where
    (e.metadata->>'source' in ('adult_cast_expansion_v1', 'gilded_coast_adult_cast_v1')
      and (e.history like '% as a living contact, not a rumor.'
        or e.history like '% keep overlapping nights in % and neither pretends the work is the whole of them.'
        or e.history like '% trusts % more than the house.'))
    or (e.metadata->>'source' = 'juniper_city_social_v3'
      and e.history like '%Their actual closeness and what they share remain specific to them.')
    or (e.metadata->>'source' = 'calders_run_authoring_v1'
      and e.history = 'An established personal connection; details require direct knowledge.')
    or (e.metadata->>'source' = 'vespormoor_roster_v1'
      and e.history = 'They belong to an authored Vespormoor social circle, but closeness and what they share remain relationship-specific.')
    or (e.metadata->>'source' = 'vharadren_content_pack_v1'
      and e.history like 'They know one another through %, % faction overlap, or repeated %.')
    or (e.metadata->>'source' in ('neon_kyo_character_roster', 'neon_kyo_male_expansion_v1')
      and e.history ilike '%authored NEON KYO social circle.')
    or (e.metadata->>'source' = 'port_vervelle_character_roster'
      and e.history like '% are part of the same Port Vervelle social circle.')
), rewritten as (
  select id,
    case
      when metadata->>'source' in ('adult_cast_expansion_v1', 'gilded_coast_adult_cast_v1')
        and history like '% as a living contact, not a rumor.' then
        case variation
          when 0 then source_name || ' trusts ' || target_name || ' enough to ask them directly when something matters.'
          when 1 then source_name || ' would rather hear it from ' || target_name || ' than have it passed around by other people.'
          when 2 then source_name || ' knows ' || target_name || ' personally and takes their word seriously.'
          when 3 then 'When ' || source_name || ' needs a straight answer, they go to ' || target_name || '.'
          else source_name || ' and ' || target_name || ' can talk directly instead of relying on secondhand stories.'
        end
      when metadata->>'source' in ('adult_cast_expansion_v1', 'gilded_coast_adult_cast_v1') then
        case variation % 4
          when 0 then source_name || ' and ' || target_name || ' look out for each other at work.'
          when 1 then source_name || ' trusts ' || target_name || ' to speak up when a job is going badly.'
          when 2 then source_name || ' and ' || target_name || ' work well together, even when the day gets difficult.'
          else source_name || ' would rather have ' || target_name || ' beside them when work gets complicated.'
        end
      when metadata->>'source' = 'juniper_city_social_v3' then
        source_name || ' and ' || target_name || ' know each other through ' || juniper_setting || '. ' ||
        case relationship_type
          when 'close_friend' then 'They are close enough to check in when one of them is having a rough day.'
          when 'friend' then 'They make time to catch up outside the usual crowd.'
          when 'friendly_rival' then 'They like trying to outdo each other, and both know it is part of the fun.'
          when 'colleague' then 'They can talk shop without pretending to agree on everything.'
          else 'They will stop and talk when they run into each other.'
        end
      when metadata->>'source' = 'calders_run_authoring_v1' then
        case
          when relationship_type ~* '(mother|daughter|father|son|aunt|niece|uncle|sibling)' then
            source_name || ' and ' || target_name || ' are family. They know each other well enough to disagree without losing the connection.'
          when relationship_type ~* '(rival|friction|tension|adversarial|disagreement|grievance|refused|damaged)' then
            source_name || ' and ' || target_name || ' have had their differences, and neither has forgotten them.'
          when relationship_type ~* '(friend|companionship|regulars|neighbor|hospitality)' then
            source_name || ' and ' || target_name || ' are friends who still make room for each other in a busy town.'
          when relationship_type ~* '(mentor|apprentice|student)' then
            source_name || ' and ' || target_name || ' have learned from each other, even when they see the work differently.'
          when relationship_type ~* '(work|colleague|professional|business|supply|customer|contract|carrier|courier|transport|route|trade|shop)' then
            source_name || ' and ' || target_name || ' know each other through work and can speak plainly when something needs doing.'
          else
            source_name || ' and ' || target_name || ' know each other around Calder''s Run and have more than a passing hello between them.'
        end
      when metadata->>'source' = 'vespormoor_roster_v1' then
        source_name || ' and ' || target_name || ' know each other in Vespormoor. ' ||
        case relationship_type
          when 'close_friend' then 'They are close enough to notice when the other is having a hard day.'
          when 'friend' then 'They make time to talk when their paths cross.'
          when 'colleague' then 'They have worked together and know how the other handles pressure.'
          else 'They recognize each other and will stop for a conversation.'
        end
      when metadata->>'source' = 'vharadren_content_pack_v1' then
        source_name || ' and ' || target_name || ' know each other around ' || vharadren_district || '. ' ||
        case relationship_type
          when 'trusted contact' then 'If one needs to check a story, they can ask the other directly.'
          when 'house colleague' then 'They have worked under the same roof and know what the other is like on a difficult day.'
          else 'They cross paths often enough to stop and talk.'
        end
      when metadata->>'source' in ('neon_kyo_character_roster', 'neon_kyo_male_expansion_v1') then
        case variation % 3
          when 0 then source_name || ' and ' || target_name || ' know each other around Neon Kyo and stop to talk when they cross paths.'
          when 1 then source_name || ' recognizes ' || target_name || ' around the city; they have talked enough to skip the introductions.'
          else source_name || ' and ' || target_name || ' move in some of the same circles in Neon Kyo and know each other by name.'
        end
      when metadata->>'source' = 'port_vervelle_character_roster' then
        case variation % 3
          when 0 then source_name || ' and ' || target_name || ' are friends in Port Vervelle and make time to catch up.'
          when 1 then source_name || ' knows ' || target_name || ' well enough to stop for a real conversation when they meet in town.'
          else source_name || ' and ' || target_name || ' keep in touch around Port Vervelle, even when life gets busy.'
        end
    end as new_history
  from candidates
)
update public.together_character_relationship_edges edge
set history = rewritten.new_history,
    metadata = edge.metadata || jsonb_build_object('historyEditorialVersion', 'human_v1'),
    updated_at = clock_timestamp()
from rewritten
where edge.id = rewritten.id and rewritten.new_history is not null;

-- The club coworkers have a more specific established tie than the generic
-- trusted-contact pattern. Keep it visible without implying romance or access.
update public.together_character_relationship_edges edge
set history = 'Roxie and Lila work at the Red Hour. Roxie asks Lila what happened on the floor before she takes a guest''s word for it.',
    updated_at = clock_timestamp()
from public.together_character_templates source,
     public.together_character_templates target
where edge.source_template_id = source.id and edge.target_template_id = target.id
  and source.slug = 'roxie-hale' and target.slug = 'lila-quinn'
  and edge.metadata->>'source' = 'adult_cast_expansion_v1';

commit;
