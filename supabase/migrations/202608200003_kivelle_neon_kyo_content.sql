begin;

insert into public.together_event_templates(
  id,name,event_type,world_id,default_location_id,participant_template_ids,
  significance,probability,duration_minutes,narrative_summary,state_effects,
  user_visibility,proactive_eligible,metadata,active,category,tone,scale,
  content_level,conditions,followups
) values
  (
    '3a000000-0000-4000-8000-000000000001','NEON KYO Rain Protocol','weather',
    '10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000007',
    array(select id from public.together_character_templates where published=true)::uuid[],
    0.55,0.18,90,'Heavy rain redirects Hikari crowds beneath the skybridges, creating delays, accidental proximity, and unusual pockets of privacy.',
    '{}'::jsonb,'contextual',true,'{"worldSlug":"neon-kyo","worldEvent":true,"civicRatingVisible":true}'::jsonb,
    true,'weather','surprising','normal','standard','{"weather":["rain","storm"]}'::jsonb,'{}'::text[]
  ),
  (
    '3a000000-0000-4000-8000-000000000002','Nova Arena Finals','social',
    '10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000034',
    array(select id from public.together_character_templates where published=true)::uuid[],
    0.62,0.13,150,'A championship match turns the Undergrid into a district-wide party that corporate crowd systems cannot fully control.',
    '{}'::jsonb,'visible',true,'{"worldSlug":"neon-kyo","worldEvent":true}'::jsonb,
    true,'celebration','exciting','meaningful','standard','{}'::jsonb,'{}'::text[]
  ),
  (
    '3a000000-0000-4000-8000-000000000003','A Night in the Blind Zone','world',
    '10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000042',
    array(select id from public.together_character_templates where published=true)::uuid[],
    0.58,0.12,120,'A spreading signal outage turns part of Old Kyo into a rare civic blind zone and draws people who need to speak without a record.',
    '{}'::jsonb,'contextual',true,'{"worldSlug":"neon-kyo","worldEvent":true,"surveillanceBlindZone":true}'::jsonb,
    true,'discovery','emotional','meaningful','romance','{}'::jsonb,'{}'::text[]
  ),
  (
    '3a000000-0000-4000-8000-000000000004','The Rating Audit','personal',
    '10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000024',
    array(select id from public.together_character_templates where published=true)::uuid[],
    0.68,0.10,60,'A Civic Rating discrepancy forces a character to decide whether to correct the record, exploit it, or learn who changed it.',
    '{"stress":1}'::jsonb,'visible',true,'{"worldSlug":"neon-kyo","worldEvent":true,"civicRating":true}'::jsonb,
    true,'conflict','stressful','meaningful','standard','{}'::jsonb,'{}'::text[]
  )
on conflict(id) do update set
  name=excluded.name,event_type=excluded.event_type,world_id=excluded.world_id,
  default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,
  significance=excluded.significance,probability=excluded.probability,
  duration_minutes=excluded.duration_minutes,narrative_summary=excluded.narrative_summary,
  state_effects=excluded.state_effects,user_visibility=excluded.user_visibility,
  proactive_eligible=excluded.proactive_eligible,metadata=excluded.metadata,active=true,
  category=excluded.category,tone=excluded.tone,scale=excluded.scale,
  content_level=excluded.content_level,conditions=excluded.conditions,
  followups=excluded.followups,updated_at=now();

insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,
  chapters,cooldown_days,repeatable,priority,active,world_scope,specific_world_id
) values
  (
    'neon-kyo-rating-change','The Rating Changed','personal',
    array(select id from public.together_character_templates where published=true)::uuid[],
    'friend','{"worldFamiliarity":1}'::jsonb,
    '[{"id":"notice","title":"A number moves","userVisibility":"contextual","mayTriggerProactiveMessage":true,"mayCreateMoment":false,"narrativeSeed":"A Civic Rating changes without explanation, quietly altering access and attention across NEON KYO.","minimumHoursBeforeNext":12},{"id":"trace","title":"Follow the record","userVisibility":"visible","mayTriggerProactiveMessage":true,"mayCreateMoment":false,"narrativeSeed":"Following the rating trail reveals that the city recorded something neither person remembers authorizing.","minimumHoursBeforeNext":24},{"id":"choice","title":"What stays visible","userVisibility":"visible","mayTriggerProactiveMessage":true,"mayCreateMoment":true,"narrativeSeed":"The truth creates a choice between repairing a public identity and protecting something genuine from the system.","minimumHoursBeforeNext":24}]'::jsonb,
    45,false,'major',true,'specific','10000000-0000-4000-8000-000000000009'
  ),
  (
    'neon-kyo-offline-truth','A Night Completely Offline','relationship',
    array(select id from public.together_character_templates where published=true)::uuid[],
    'dating','{"trust":24}'::jsonb,
    '[{"id":"invitation","title":"Leave the signal behind","userVisibility":"contextual","mayTriggerProactiveMessage":true,"mayCreateMoment":false,"narrativeSeed":"An invitation to Old Kyo asks both people to surrender filters, navigation, and the safety of a searchable record.","minimumHoursBeforeNext":12},{"id":"honesty","title":"No editable version","userVisibility":"visible","mayTriggerProactiveMessage":true,"mayCreateMoment":false,"narrativeSeed":"Without the city mediating the night, a carefully managed truth becomes impossible to avoid.","minimumHoursBeforeNext":24},{"id":"return","title":"Reconnect","userVisibility":"visible","mayTriggerProactiveMessage":true,"mayCreateMoment":true,"narrativeSeed":"Returning to the network tests whether the private truth changes how they live in public.","minimumHoursBeforeNext":24}]'::jsonb,
    60,false,'major',true,'specific','10000000-0000-4000-8000-000000000009'
  )
on conflict(slug) do update set
  title=excluded.title,category=excluded.category,
  eligible_template_ids=excluded.eligible_template_ids,
  min_relationship_stage=excluded.min_relationship_stage,
  prerequisites=excluded.prerequisites,chapters=excluded.chapters,
  cooldown_days=excluded.cooldown_days,repeatable=excluded.repeatable,
  priority=excluded.priority,active=true,world_scope='specific',
  specific_world_id=excluded.specific_world_id,updated_at=now();

insert into public.together_date_templates(
  id,name,slug,world_id,location_id,description,hero_asset_key,
  phases,unlock_rules,entitlement_key,active
) values
  (
    '4a000000-0000-4000-8000-000000000001','No Filters','neon-kyo-no-filters',
    '10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000046',
    'Walk through Koi Garden without projected faces, synthetic makeup, or an editable version of the evening.',
    'neon-kyo-hero',
    '[{"id":"arrival","title":"Go offline","choices":[{"id":"disconnect","label":"Disconnect completely"},{"id":"hesitate","label":"Admit this feels exposed"}]},{"id":"conversation","title":"See each other","choices":[{"id":"ask-real","label":"Ask what the city never gets to hear"},{"id":"share-first","label":"Offer the first unfiltered truth"}]},{"id":"turn","title":"Stay unrecorded","choices":[{"id":"garden","label":"Keep walking through the garden"},{"id":"soba","label":"Find a quiet table nearby"}]},{"id":"resolution","title":"Reconnect","choices":[]}]'::jsonb,
    '{"familiarity":18,"trust":18,"allowed_stages":["friend","flirting","dating","exclusive","long_term"]}'::jsonb,
    'worlds.standard',true
  ),
  (
    '4a000000-0000-4000-8000-000000000002','Rain Above Hikari','neon-kyo-rain-above-hikari',
    '10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000013',
    'Cross the transparent Hikari Skybridge in the rain, sixty floors above the city and briefly between destinations.',
    'neon-kyo-hero',
    '[{"id":"arrival","title":"Step onto the bridge","choices":[{"id":"glass","label":"Look down through the glass"},{"id":"close","label":"Stay close and look outward"}]},{"id":"conversation","title":"Between places","choices":[{"id":"public","label":"Talk about the life everyone sees"},{"id":"private","label":"Ask what stays private"}]},{"id":"turn","title":"The rain intensifies","choices":[{"id":"wait","label":"Wait it out together"},{"id":"cross","label":"Keep walking"}]},{"id":"resolution","title":"Choose where next","choices":[]}]'::jsonb,
    '{"familiarity":12,"trust":12,"allowed_stages":["acquaintance","friend","flirting","dating","exclusive","long_term"]}'::jsonb,
    'worlds.standard',true
  )
on conflict(id) do update set
  name=excluded.name,slug=excluded.slug,world_id=excluded.world_id,
  location_id=excluded.location_id,description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,phases=excluded.phases,
  unlock_rules=excluded.unlock_rules,entitlement_key=excluded.entitlement_key,
  active=true,updated_at=now();

commit;
