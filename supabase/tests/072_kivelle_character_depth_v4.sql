begin;
select plan(8);

select has_column(
  'public','together_relationship_reflections','user_view',
  'Each companion can maintain an evidence-based view of the user'
);

select is(
  (select count(*)::integer
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id
    and version.version=template.current_published_version
   where template.published=true and version.character_bible->>'depthVersion'='5' and version.character_bible->>'depthAuthored'='true'),
  91,
  'All 91 current companions have authored Character Depth v5 profiles'
);

select is(
  (select count(*)
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id
    and version.version=template.current_published_version
   where version.character_bible->>'depthAuthored'='true'
     and (not (version.character_bible?'voice') or not (version.character_bible?'psychology') or not (version.character_bible?'perceptionLenses') or not (version.character_bible?'conversationalMoves'))),
  0::bigint,
  'Every v4 profile has voice, psychology, perception, and conversational movement'
);

select is(
  (select count(*)
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id
    and version.version=template.current_published_version
   where version.character_bible->>'depthAuthored'='true'
     and jsonb_array_length(version.character_bible->'anecdotes')<2),
  0::bigint,
  'Every authored v4 profile has at least two gated personal-history anecdotes'
);

select is(
  (select count(*)
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id
    and version.version=template.current_published_version
   where version.character_bible->>'depthAuthored'='true'
     and coalesce((version.communication_style->>'responseShapeVariation')::boolean,false)=false),
  0::bigint,
  'Every v4 profile enables response-shape variation'
);

select is(
  (select count(*)
   from public.together_character_templates template
   join public.together_character_versions version
     on version.character_template_id=template.id
    and version.version=template.current_published_version
   where version.character_bible->>'depthAuthored'='true'
     and coalesce((version.communication_style->>'adultVoiceContinuity')::boolean,false)=false),
  0::bigint,
  'Personality continuity remains enabled for eligible adult dialogue'
);

select ok(
  not exists(select 1 from public.together_character_templates where slug='akari-fujimoto')
  or (select count(*)
      from public.together_character_templates template
      join public.together_character_versions version
        on version.character_template_id=template.id
       and version.version=template.current_published_version
      where template.slug=any(array[
        'akari-fujimoto','ana-luiza-ribeiro','aya-mori','chloe-mercier','elena-volkov','emi-takahashi','eva-aoyama','freya-keller','fumi-arai','iori',
        'isabella-reyes','kira-3','laleh-rahimi','lexi-morgan','mei-watanabe','mia-lindstrom','mika-sato','mina-seo','natsumi-endo','noa-7',
        'piper-shaw','reina-kuroda','rika-senzaki','rin-akiyama','sora-hayashi','talia-okafor','vittoria-bellandi','yumi-kato','yuna-park','zhen-li'
      ]) and version.character_bible->>'depthVersion'='5' and version.character_bible->>'depthAuthored'='true')=30,
  'When Neon Kyo is present, all 30 native companions receive authored v5 profiles'
);

select col_not_null(
  'public','together_relationship_reflections','user_view',
  'Every reflection has a usable companion user-view object'
);

select * from finish();
rollback;
