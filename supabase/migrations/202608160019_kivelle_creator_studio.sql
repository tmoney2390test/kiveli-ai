begin;

-- Custom companion creation used to materialize CharacterTemplate rows before
-- the user had reviewed the character. Creator drafts now remain account-owned
-- working state until one transaction promotes them into the canonical engine.
alter table public.together_character_templates alter column id set default gen_random_uuid();
alter table public.together_character_versions alter column id set default gen_random_uuid();
alter table public.together_character_versions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.together_creator_drafts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_continuity_id uuid references public.together_continuities(id) on delete set null,
  world_id uuid not null references public.together_worlds(id) on delete restrict,
  status text not null default 'concept' check(status in('concept','editing','ready','finalized','archived')),
  current_step text not null default 'identity' check(current_step in('identity','appearance','personality','life','connection','meeting','review')),
  revision integer not null default 1 check(revision > 0),
  create_request_id uuid not null,
  source_concept text not null check(char_length(source_concept) between 20 and 1200),
  relationship_goal text not null default 'either' check(relationship_goal in('friendship','romance','either')),
  identity_config jsonb not null default '{}'::jsonb,
  personality_config jsonb not null default '{}'::jsonb,
  communication_config jsonb not null default '{}'::jsonb,
  connection_config jsonb not null default '{}'::jsonb,
  appearance_config jsonb not null default '{}'::jsonb,
  life_config jsonb not null default '{}'::jsonb,
  routine_config jsonb not null default '{"blocks":[]}'::jsonb,
  first_meeting_config jsonb not null default '{"options":[]}'::jsonb,
  legacy_template_id uuid references public.together_character_templates(id) on delete set null,
  finalized_template_id uuid references public.together_character_templates(id) on delete set null,
  finalize_request_id uuid,
  finalized_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,create_request_id)
);
create unique index if not exists together_creator_drafts_legacy_template_idx on public.together_creator_drafts(legacy_template_id) where legacy_template_id is not null;
create index if not exists together_creator_drafts_user_status_idx on public.together_creator_drafts(user_id,status,updated_at desc);
create index if not exists together_creator_drafts_continuity_idx on public.together_creator_drafts(target_continuity_id,updated_at desc);

create table if not exists public.together_creator_assets(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references public.together_creator_drafts(id) on delete cascade,
  asset_type text not null default 'appearance_candidate' check(asset_type in('appearance_candidate','meeting_preview')),
  status text not null default 'queued' check(status in('queued','generating','ready','failed','archived')),
  label text not null,
  description text not null,
  storage_path text,
  content_type text,
  width integer,
  height integer,
  provider text,
  model text,
  group_request_id uuid not null,
  selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(draft_id,id)
);
create index if not exists together_creator_assets_draft_group_idx on public.together_creator_assets(draft_id,group_request_id,created_at);
create unique index if not exists together_creator_assets_one_selected_appearance_idx on public.together_creator_assets(draft_id) where selected and asset_type='appearance_candidate' and status='ready';

alter table public.together_creator_drafts enable row level security;
alter table public.together_creator_assets enable row level security;
drop policy if exists together_creator_drafts_own_read on public.together_creator_drafts;
create policy together_creator_drafts_own_read on public.together_creator_drafts for select to authenticated using(user_id=auth.uid());
drop policy if exists together_creator_assets_own_read on public.together_creator_assets;
create policy together_creator_assets_own_read on public.together_creator_assets for select to authenticated using(user_id=auth.uid());

-- Version visibility follows its CharacterTemplate. A private creator version must
-- not become globally readable merely because an older client populated published_at.
drop policy if exists together_versions_read on public.together_character_versions;
create policy together_versions_read on public.together_character_versions for select using(
  exists(
    select 1 from public.together_character_templates template
    where template.id=character_template_id
      and (template.creator_id=auth.uid() or (template.published and template.visibility in('public','unlisted')))
  )
);
grant select on public.together_creator_drafts,public.together_creator_assets to authenticated;

-- Preserve unfinished templates created by the original V1 creator. They are
-- represented as resumable drafts and continue to point at the same template.
insert into public.together_creator_drafts(
  user_id,target_continuity_id,world_id,status,current_step,create_request_id,
  source_concept,relationship_goal,identity_config,personality_config,
  communication_config,connection_config,appearance_config,life_config,
  routine_config,first_meeting_config,legacy_template_id,metadata
)
select
  template.creator_id,
  profile.active_continuity_id,
  coalesce(meeting_location.world_id,home_location.world_id,presence.world_id),
  'editing','appearance',gen_random_uuid(),
  left(case when char_length(coalesce(template.biography,''))>=20 then template.biography else 'Continue creating this original fictional adult companion.' end,1200),
  template.relationship_goal,
  jsonb_build_object(
    'name',template.name,'age',template.age,'pronouns',version.pronouns,
    'occupation',template.occupation,'biography',template.biography,
    'interests',to_jsonb(coalesce(version.interests,'{}'::text[])),
    'traits',coalesce(template.discovery_metadata->'traits','[]'::jsonb),
    'ambitions',coalesce(version.character_bible->'ambitions','[]'::jsonb)
  ),
  coalesce(version.personality_config,'{}'::jsonb),
  coalesce(version.communication_style,'{}'::jsonb),
  coalesce(version.relationship_config,template.connection_config,'{}'::jsonb),
  coalesce(version.appearance_config,'{}'::jsonb)||jsonb_build_object(
    'canonicalDescription',coalesce(version.visual_identity->>'canonicalDescription',version.appearance_config->>'description'),
    'referenceStoragePaths',coalesce(version.visual_identity->'referenceStoragePaths','[]'::jsonb)
  ),
  coalesce(version.life_config,'{}'::jsonb),
  jsonb_build_object('blocks',coalesce(schedule.blocks,'[]'::jsonb),'source','legacy_creator'),
  case when template.first_meeting is null then '{"options":[]}'::jsonb else jsonb_build_object(
    'selectedId','legacy',
    'options',jsonb_build_array(jsonb_build_object(
      'id','legacy','worldId',template.first_meeting->>'world_id','locationId',template.first_meeting->>'location_id',
      'title',template.first_meeting->>'title','setup',template.first_meeting->>'setup',
      'companionActivity',template.first_meeting->>'companion_activity','mood',template.first_meeting->>'mood',
      'openingLine',template.first_meeting->>'opening_line','suggestedPrompts',coalesce(template.first_meeting->'suggested_prompts','[]'::jsonb)
    )))
  end,
  template.id,
  jsonb_build_object('migrationSource','creator_v1_template','contextVersion',1)
from public.together_character_templates template
join lateral (
  select candidate.* from public.together_character_versions candidate
  where candidate.character_template_id=template.id
  order by (candidate.version=template.current_published_version) desc,candidate.version desc limit 1
) version on true
left join public.together_profiles profile on profile.user_id=template.creator_id
left join public.together_locations meeting_location on meeting_location.id=nullif(template.first_meeting->>'location_id','')::uuid
left join public.together_locations home_location on home_location.id=nullif(version.life_config->>'homeLocationId','')::uuid
left join lateral (
  select item.world_id from public.together_character_world_presence item
  where item.character_version_id=version.id order by (item.presence_type='resident') desc limit 1
) presence on true
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'id',row.id,'dayOfWeek',row.day_of_week,'startMinute',row.start_minute,'endMinute',row.end_minute,
    'locationId',row.location_id,'activity',row.activity,'availability',row.availability,
    'energyDelta',row.energy_delta,'moodInfluence',row.mood_influence
  ) order by row.day_of_week,row.start_minute) as blocks
  from public.together_schedule_templates row where row.character_version_id=version.id
) schedule on true
where template.creator_id is not null
  and template.lifecycle_status='draft'
  and coalesce(meeting_location.world_id,home_location.world_id,presence.world_id) is not null
  and not exists(select 1 from public.together_creator_drafts draft where draft.legacy_template_id=template.id);

create or replace function public.kivelle_finalize_creator_draft(
  p_user_id uuid,
  p_draft_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  draft public.together_creator_drafts%rowtype;
  identity jsonb;
  personality jsonb;
  communication jsonb;
  connection jsonb;
  appearance jsonb;
  life jsonb;
  routine jsonb;
  meeting jsonb;
  selected_asset public.together_creator_assets%rowtype;
  template_id uuid;
  version_id uuid;
  template_version integer := 1;
  public_handle text;
  home_location_id uuid;
  meeting_location_id uuid;
  meeting_world_id uuid;
  block_count integer;
  inserted_count integer;
  now_value timestamptz := now();
begin
  select * into draft from public.together_creator_drafts
  where id=p_draft_id and user_id=p_user_id for update;
  if draft.id is null then raise exception 'Creator draft not found'; end if;
  if draft.status='archived' then raise exception 'Creator draft is archived'; end if;
  if draft.finalized_template_id is not null then
    return jsonb_build_object('draftId',draft.id,'characterTemplateId',draft.finalized_template_id,'idempotent',true);
  end if;
  if draft.finalize_request_id is not null and draft.finalize_request_id<>p_request_id then
    raise exception 'Creator draft finalization is already in progress';
  end if;

  identity:=draft.identity_config;
  personality:=draft.personality_config;
  communication:=draft.communication_config;
  connection:=draft.connection_config;
  appearance:=draft.appearance_config;
  life:=draft.life_config;
  routine:=draft.routine_config;

  if nullif(btrim(identity->>'name'),'') is null or char_length(identity->>'name')>50 then raise exception 'A valid character name is required'; end if;
  if coalesce((identity->>'age')::integer,0)<18 then raise exception 'Custom companions must be adults'; end if;
  if nullif(btrim(identity->>'occupation'),'') is null then raise exception 'A valid occupation is required'; end if;
  if char_length(coalesce(identity->>'biography',''))<20 then raise exception 'A complete biography is required'; end if;

  home_location_id:=nullif(life->>'homeLocationId','')::uuid;
  if home_location_id is null or not exists(select 1 from public.together_locations location where location.id=home_location_id and location.world_id=draft.world_id) then
    raise exception 'Choose a home area in the selected world';
  end if;

  select * into selected_asset from public.together_creator_assets asset
  where asset.draft_id=draft.id and asset.user_id=p_user_id and asset.asset_type='appearance_candidate'
    and asset.status='ready' and asset.selected order by asset.updated_at desc limit 1;
  if selected_asset.id is null and jsonb_array_length(coalesce(appearance->'referenceStoragePaths','[]'::jsonb))=0 then
    raise exception 'Choose a canonical appearance before meeting this companion';
  end if;

  select option into meeting
  from jsonb_array_elements(coalesce(draft.first_meeting_config->'options','[]'::jsonb)) option
  where option->>'id'=draft.first_meeting_config->>'selectedId' limit 1;
  if meeting is null then raise exception 'Choose a first meeting'; end if;
  meeting_location_id:=nullif(meeting->>'locationId','')::uuid;
  meeting_world_id:=nullif(meeting->>'worldId','')::uuid;
  if meeting_world_id<>draft.world_id or not exists(select 1 from public.together_locations location where location.id=meeting_location_id and location.world_id=draft.world_id) then
    raise exception 'The first meeting must use a canonical place in the selected world';
  end if;

  block_count:=jsonb_array_length(coalesce(routine->'blocks','[]'::jsonb));
  if block_count=0 then raise exception 'Generate a weekly routine before meeting this companion'; end if;
  select count(*) into inserted_count
  from jsonb_array_elements(routine->'blocks') block
  join public.together_locations location on location.id=nullif(block->>'locationId','')::uuid and location.world_id=draft.world_id
  where (block->>'dayOfWeek')::integer between 0 and 6
    and (block->>'startMinute')::integer between 0 and 1439
    and (block->>'endMinute')::integer between 1 and 1440
    and (block->>'endMinute')::integer>(block->>'startMinute')::integer;
  if inserted_count<>block_count then raise exception 'The routine contains an invalid place or time'; end if;
  if exists(
    select 1
    from jsonb_array_elements(routine->'blocks') with ordinality left_block(block,left_index)
    join jsonb_array_elements(routine->'blocks') with ordinality right_block(block,right_index)
      on left_index<right_index
     and left_block.block->>'dayOfWeek'=right_block.block->>'dayOfWeek'
     and (left_block.block->>'startMinute')::integer<(right_block.block->>'endMinute')::integer
     and (right_block.block->>'startMinute')::integer<(left_block.block->>'endMinute')::integer
  ) then raise exception 'Routine blocks cannot overlap'; end if;

  template_id:=draft.legacy_template_id;
  if template_id is null then
    template_id:=gen_random_uuid();
    version_id:=gen_random_uuid();
    public_handle:=coalesce(nullif(trim(both '-' from left(regexp_replace(lower(identity->>'name'),'[^a-z0-9]+','-','g'),30)),''),'companion')||'-'||substr(replace(template_id::text,'-',''),1,7);
    insert into public.together_character_templates(
      id,name,slug,public_handle,age,occupation,biography,creator_id,current_published_version,
      published,lifecycle_status,visibility,relationship_goal,connection_config,
      character_role,can_be_selected,can_be_romanced,discovery_metadata,first_meeting,updated_at
    ) values (
      template_id,identity->>'name',public_handle,public_handle,(identity->>'age')::integer,
      identity->>'occupation',identity->>'biography',p_user_id,1,false,'ready','private',
      draft.relationship_goal,connection,'romanceable_companion',true,draft.relationship_goal<>'friendship',
      jsonb_build_object('summary',identity->>'biography','traits',coalesce(identity->'traits','[]'::jsonb),
        'goals',case when draft.relationship_goal='friendship' then '["Friendship","Stories"]'::jsonb else '["Dating","Friendship","Stories"]'::jsonb end,
        'custom',true,'creatorDraftId',draft.id),
      jsonb_build_object('world_id',meeting_world_id,'location_id',meeting_location_id,'title',meeting->>'title',
        'setup',meeting->>'setup','companion_activity',meeting->>'companionActivity','mood',meeting->>'mood',
        'opening_line',meeting->>'openingLine','suggested_prompts',coalesce(meeting->'suggestedPrompts','[]'::jsonb)),now_value
    );
  else
    if exists(select 1 from public.together_character_instances where character_template_id=template_id) then
      raise exception 'An existing relationship cannot be finalized as a draft';
    end if;
    select current_published_version into template_version from public.together_character_templates where id=template_id and creator_id=p_user_id for update;
    select id into version_id from public.together_character_versions where character_template_id=template_id order by (version=template_version) desc,version desc limit 1;
    update public.together_character_templates set
      name=identity->>'name',age=(identity->>'age')::integer,occupation=identity->>'occupation',biography=identity->>'biography',
      lifecycle_status='ready',visibility='private',published=false,can_be_selected=true,
      can_be_romanced=draft.relationship_goal<>'friendship',relationship_goal=draft.relationship_goal,
      connection_config=connection,discovery_metadata=coalesce(discovery_metadata,'{}'::jsonb)||jsonb_build_object(
        'summary',identity->>'biography','traits',coalesce(identity->'traits','[]'::jsonb),'custom',true,'creatorDraftId',draft.id),
      first_meeting=jsonb_build_object('world_id',meeting_world_id,'location_id',meeting_location_id,'title',meeting->>'title',
        'setup',meeting->>'setup','companion_activity',meeting->>'companionActivity','mood',meeting->>'mood',
        'opening_line',meeting->>'openingLine','suggested_prompts',coalesce(meeting->'suggestedPrompts','[]'::jsonb)),updated_at=now_value
    where id=template_id and creator_id=p_user_id;
  end if;

  if version_id is null then version_id:=gen_random_uuid(); end if;
  if not exists(select 1 from public.together_character_versions where id=version_id) then
    insert into public.together_character_versions(
      id,character_template_id,version,pronouns,personality_config,values_config,interests,
      communication_style,appearance_config,visual_identity,voice_config,boundaries,
      default_social_graph,portrait_asset_key,relationship_config,life_config,character_bible,
      appearance_candidates,published_at,updated_at
    ) values (
      version_id,template_id,template_version,nullif(identity->>'pronouns',''),personality,
      '{"autonomy":0.9,"mutualRespect":0.9}'::jsonb,
      array(select jsonb_array_elements_text(coalesce(identity->'interests','[]'::jsonb))),communication,
      appearance||jsonb_build_object('selectedCandidateId',selected_asset.id),
      jsonb_build_object('canonicalDescription',coalesce(selected_asset.description,appearance->>'canonicalDescription'),
        'referenceStoragePaths',case when selected_asset.storage_path is not null then jsonb_build_array(selected_asset.storage_path) else coalesce(appearance->'referenceStoragePaths','[]'::jsonb) end,
        'visualDoNotChange',coalesce(selected_asset.metadata->'visualDoNotChange','[]'::jsonb),'identityVersion',1,'fictional',true),
      '{}'::jsonb,array['fictional adult','mutual consent','independent point of view'],
      '[]'::jsonb,null,connection,life||jsonb_build_object('homeWorldId',draft.world_id,'homeLocationId',home_location_id),
      jsonb_build_object('promptVersion',3,'traits',coalesce(identity->'traits','[]'::jsonb),
        'ambitions',coalesce(identity->'ambitions','[]'::jsonb),'communicationStyle',communication,
        'relationshipStyle',connection,'personalityNote',personality->>'note','values',jsonb_build_object('autonomy',0.9,'mutualRespect',0.9),
        'boundaries',jsonb_build_array('fictional adult','mutual consent','independent point of view')),
      coalesce((select jsonb_agg(jsonb_build_object('id',asset.id,'label',asset.label,'description',asset.description,
        'storagePath',asset.storage_path,'width',asset.width,'height',asset.height,'provider',asset.provider,'model',asset.model,
        'visualDoNotChange',coalesce(asset.metadata->'visualDoNotChange','[]'::jsonb)) order by asset.created_at)
        from public.together_creator_assets asset where asset.draft_id=draft.id and asset.asset_type='appearance_candidate' and asset.status='ready'),'[]'::jsonb),null,now_value
    );
  else
    update public.together_character_versions set
      pronouns=nullif(identity->>'pronouns',''),personality_config=personality,
      interests=array(select jsonb_array_elements_text(coalesce(identity->'interests','[]'::jsonb))),communication_style=communication,
      appearance_config=appearance||jsonb_build_object('selectedCandidateId',selected_asset.id),
      visual_identity=jsonb_build_object('canonicalDescription',coalesce(selected_asset.description,appearance->>'canonicalDescription'),
        'referenceStoragePaths',case when selected_asset.storage_path is not null then jsonb_build_array(selected_asset.storage_path) else coalesce(appearance->'referenceStoragePaths','[]'::jsonb) end,
        'visualDoNotChange',coalesce(selected_asset.metadata->'visualDoNotChange','[]'::jsonb),'identityVersion',coalesce((visual_identity->>'identityVersion')::integer,0)+1,'fictional',true),
      relationship_config=connection,life_config=life||jsonb_build_object('homeWorldId',draft.world_id,'homeLocationId',home_location_id),
      character_bible=coalesce(character_bible,'{}'::jsonb)||jsonb_build_object('promptVersion',3,'traits',coalesce(identity->'traits','[]'::jsonb),
        'ambitions',coalesce(identity->'ambitions','[]'::jsonb),'communicationStyle',communication,'relationshipStyle',connection,'personalityNote',personality->>'note'),
      published_at=null,updated_at=now_value
    where id=version_id;
  end if;

  insert into public.together_character_world_presence(character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata)
  values(version_id,draft.world_id,'resident',home_location_id,0.65,0,jsonb_build_object('custom',true,'creator_id',p_user_id,'creatorDraftId',draft.id))
  on conflict(character_version_id,world_id) do update set presence_type='resident',home_location_id=excluded.home_location_id,metadata=excluded.metadata,updated_at=now_value;

  delete from public.together_schedule_templates where character_version_id=version_id;
  insert into public.together_schedule_templates(
    character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence,metadata
  )
  select version_id,(block->>'dayOfWeek')::smallint,(block->>'startMinute')::smallint,(block->>'endMinute')::smallint,
    (block->>'locationId')::uuid,block->>'activity',coalesce(block->>'availability','available'),
    coalesce((block->>'energyDelta')::smallint,0),nullif(block->>'moodInfluence',''),jsonb_build_object('source','creator_studio','creatorDraftId',draft.id)
  from jsonb_array_elements(routine->'blocks') block;

  update public.together_creator_drafts set status='finalized',current_step='review',finalized_template_id=template_id,
    finalize_request_id=p_request_id,finalized_at=now_value,updated_at=now_value,revision=revision+1
  where id=draft.id;

  return jsonb_build_object('draftId',draft.id,'characterTemplateId',template_id,'characterVersionId',version_id,'publicHandle',
    (select public_handle from public.together_character_templates where id=template_id),'idempotent',false);
end;
$$;
revoke all on function public.kivelle_finalize_creator_draft(uuid,uuid,uuid) from public;
grant execute on function public.kivelle_finalize_creator_draft(uuid,uuid,uuid) to service_role;

comment on table public.together_creator_drafts is 'Recoverable account-owned Creator Studio state. It is not a character identity until finalized.';
comment on table public.together_creator_assets is 'Explicitly generated creator media candidates using the canonical Kivelle image provider and credit ledger.';

commit;
