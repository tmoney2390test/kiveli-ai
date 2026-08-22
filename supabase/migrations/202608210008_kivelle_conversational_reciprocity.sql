-- Make companion curiosity and conversational reciprocity part of the required
-- CharacterVersion contract. A version can never be stored without a usable
-- profile; older writers receive a deterministic profile, while malformed
-- explicitly supplied profiles are rejected by the constraint below.

alter table public.together_open_threads
  add column if not exists last_followed_up_at timestamptz,
  add column if not exists followup_count integer not null default 0;

alter table public.together_open_threads
  drop constraint if exists together_open_threads_followup_count_check;
alter table public.together_open_threads
  add constraint together_open_threads_followup_count_check
  check (followup_count between 0 and 3);

create or replace function public.kivelle_valid_curiosity_profile(profile jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when profile is null or jsonb_typeof(profile) <> 'object' then false
    when jsonb_typeof(profile->'domains') <> 'array' then false
    when jsonb_typeof(profile->'preferredMoves') <> 'object' then false
    when jsonb_typeof(profile->'avoids') <> 'array' then false
    else jsonb_array_length(profile->'domains') >= 2
      and profile->>'style' in ('observant_selective','direct_specific','teasing_playful','warm_reflective','analytical_precise')
      and profile->>'disclosureBeforeQuestion' in ('rare','sometimes','usually')
      and profile->'preferredMoves' <> '{}'::jsonb
      and jsonb_array_length(profile->'avoids') >= 1
  end;
$$;

create or replace function public.kivelle_default_curiosity_profile(
  p_interests jsonb,
  p_occupation text,
  p_personality jsonb,
  p_communication jsonb,
  p_bible jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  domains jsonb;
  style text;
  disclosure text;
  directness numeric := .5;
  humor numeric := .5;
  warmth numeric := .5;
  lens text;
  moves jsonb;
begin
  if jsonb_typeof(p_personality->'directness') = 'number' then directness := (p_personality->>'directness')::numeric; end if;
  if jsonb_typeof(p_personality->'humor') = 'number' then humor := (p_personality->>'humor')::numeric; end if;
  if jsonb_typeof(p_personality->'warmth') = 'number' then warmth := (p_personality->>'warmth')::numeric; end if;
  if jsonb_typeof(p_communication->'emotionalOpenness') = 'number' then warmth := (p_communication->>'emotionalOpenness')::numeric; end if;

  select coalesce(jsonb_agg(value order by first_seen), '[]'::jsonb)
  into domains
  from (
    select value, min(position) as first_seen
    from (
      select trim(value) as value, ordinality::integer as position
      from jsonb_array_elements_text(case when jsonb_typeof(p_interests)='array' then p_interests else '[]'::jsonb end) with ordinality
      union all
      select trim(value), 20 + ordinality::integer
      from jsonb_array_elements_text(case when jsonb_typeof(p_bible->'traits')='array' then p_bible->'traits' else '[]'::jsonb end) with ordinality
      union all
      select trim(coalesce(p_occupation,'')), 40
    ) candidates
    where value <> ''
    group by value
    order by min(position)
    limit 8
  ) ranked;

  if jsonb_array_length(domains) = 0 then domains := jsonb_build_array('the user''s present experience'); end if;
  if jsonb_array_length(domains) = 1 then domains := domains || jsonb_build_array('the choices behind what people say'); end if;

  style := case
    when coalesce(p_occupation,'') ~* '(engineer|analyst|research|security|architect|doctor|scientist|developer|investigator)' then 'analytical_precise'
    when directness >= .72 then 'direct_specific'
    when humor >= .70 then 'teasing_playful'
    when warmth >= .70 then 'warm_reflective'
    else 'observant_selective'
  end;
  disclosure := case when warmth >= .78 then 'usually' when warmth < .35 then 'rare' else 'sometimes' end;
  lens := coalesce(p_bible#>>'{perceptionLenses,0}', 'Notice the concrete detail that reveals what matters to the user.');

  moves := jsonb_build_object(
    'casual', case when coalesce(jsonb_array_length(case when jsonb_typeof(p_bible#>'{conversationalMoves,casual}')='array' then p_bible#>'{conversationalMoves,casual}' else '[]'::jsonb end),0)>0
      then p_bible#>'{conversationalMoves,casual}' else jsonb_build_array(lens || ' Ask about the choice, cause, or preference behind that detail.') end,
    'playful', case when coalesce(jsonb_array_length(case when jsonb_typeof(p_bible#>'{conversationalMoves,playful}')='array' then p_bible#>'{conversationalMoves,playful}' else '[]'::jsonb end),0)>0
      then p_bible#>'{conversationalMoves,playful}' else jsonb_build_array('Turn one specific detail into a playful opening the user can answer or challenge.') end,
    'supportive', case when coalesce(jsonb_array_length(case when jsonb_typeof(p_bible#>'{conversationalMoves,supportive}')='array' then p_bible#>'{conversationalMoves,supportive}' else '[]'::jsonb end),0)>0
      then p_bible#>'{conversationalMoves,supportive}' else jsonb_build_array('Name the concrete pressure, share one grounded perspective, then ask what response would actually help.') end,
    'affectionate', case when coalesce(jsonb_array_length(case when jsonb_typeof(p_bible#>'{conversationalMoves,affectionate}')='array' then p_bible#>'{conversationalMoves,affectionate}' else '[]'::jsonb end),0)>0
      then p_bible#>'{conversationalMoves,affectionate}' else jsonb_build_array('Reveal a specific preference or desire before inviting the user''s own.') end
  );

  return jsonb_build_object(
    'domains', domains,
    'style', style,
    'disclosureBeforeQuestion', disclosure,
    'preferredMoves', moves,
    'avoids', jsonb_build_array('generic interview questions','stacked questions','therapist framing')
  );
end;
$$;

update public.together_character_versions version
set character_bible = jsonb_set(
      coalesce(version.character_bible,'{}'::jsonb) || jsonb_build_object('promptVersion',5,'depthVersion',5),
      '{voice}',
      (case when jsonb_typeof(version.character_bible->'voice')='object' then version.character_bible->'voice' else '{}'::jsonb end)
        || jsonb_build_object(
          'curiosity', public.kivelle_default_curiosity_profile(
            to_jsonb(version.interests),
            template.occupation,
            version.personality_config,
            version.communication_style,
            version.character_bible
          ),
          'questionStyle', coalesce(version.character_bible#>>'{voice,questionStyle}','Ask specific questions grounded in what the user actually said; balance questions with independent contribution.')
        ),
      true
    ),
    communication_style = coalesce(version.communication_style,'{}'::jsonb)
      || jsonb_build_object('curiosityProfileVersion',1,'reciprocityEnabled',true),
    updated_at = now()
from public.together_character_templates template
where template.id = version.character_template_id
  and not public.kivelle_valid_curiosity_profile(version.character_bible#>'{voice,curiosity}');

create or replace function public.together_ensure_character_curiosity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  occupation text;
  profile jsonb;
  voice jsonb;
begin
  profile := new.character_bible#>'{voice,curiosity}';
  if profile is not null then return new; end if;

  select template.occupation into occupation
  from public.together_character_templates template
  where template.id = new.character_template_id;

  voice := case when jsonb_typeof(new.character_bible->'voice')='object' then new.character_bible->'voice' else '{}'::jsonb end;
  new.character_bible := jsonb_set(
    coalesce(new.character_bible,'{}'::jsonb) || jsonb_build_object('promptVersion',5,'depthVersion',5),
    '{voice}',
    voice || jsonb_build_object(
      'curiosity', public.kivelle_default_curiosity_profile(to_jsonb(new.interests),occupation,new.personality_config,new.communication_style,new.character_bible),
      'questionStyle', coalesce(voice->>'questionStyle','Ask specific questions grounded in what the user actually said; balance questions with independent contribution.')
    ),
    true
  );
  new.communication_style := coalesce(new.communication_style,'{}'::jsonb)
    || jsonb_build_object('curiosityProfileVersion',1,'reciprocityEnabled',true);
  return new;
end;
$$;

drop trigger if exists together_character_versions_require_curiosity on public.together_character_versions;
create trigger together_character_versions_require_curiosity
before insert or update of character_bible on public.together_character_versions
for each row execute function public.together_ensure_character_curiosity();

alter table public.together_character_versions
  drop constraint if exists together_character_versions_curiosity_required;
alter table public.together_character_versions
  add constraint together_character_versions_curiosity_required
  check (public.kivelle_valid_curiosity_profile(character_bible#>'{voice,curiosity}')) not valid;
alter table public.together_character_versions
  validate constraint together_character_versions_curiosity_required;

create or replace function public.together_require_selectable_character_curiosity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile jsonb;
begin
  if not (coalesce(new.published,false) or coalesce(new.can_be_selected,false)) then return new; end if;
  select version.character_bible#>'{voice,curiosity}' into profile
  from public.together_character_versions version
  where version.character_template_id=new.id and version.version=new.current_published_version;
  if not public.kivelle_valid_curiosity_profile(profile) then
    raise exception using
      errcode='23514',
      message='Selectable Kivelle characters require a valid curiosity profile.';
  end if;
  return new;
end;
$$;

drop trigger if exists together_selectable_characters_require_curiosity on public.together_character_templates;
create constraint trigger together_selectable_characters_require_curiosity
after insert or update of published,can_be_selected,current_published_version on public.together_character_templates
deferrable initially deferred
for each row execute function public.together_require_selectable_character_curiosity();

comment on column public.together_open_threads.last_followed_up_at is 'When the companion last initiated this earned follow-up.';
comment on column public.together_open_threads.followup_count is 'Bounded count of companion-initiated follow-ups used to prevent repeated questioning.';
comment on function public.kivelle_valid_curiosity_profile(jsonb) is 'Required CharacterVersion curiosity contract. Published and draft character versions must satisfy it.';
