begin;

alter table public.together_relationship_states
  add column if not exists interaction_turn_count integer not null default 0 check(interaction_turn_count>=0),
  add column if not exists conversation_session_count integer not null default 0 check(conversation_session_count>=0),
  add column if not exists meaningful_interaction_count integer not null default 0 check(meaningful_interaction_count>=0),
  add column if not exists last_interaction_quality text check(last_interaction_quality is null or last_interaction_quality in('trivial','normal','meaningful','shared_experience','major_relationship_event')),
  add column if not exists last_relationship_delta jsonb not null default '{}'::jsonb;

update public.together_relationship_states relationship set
  interaction_turn_count=greatest(relationship.interaction_turn_count,relationship.conversation_count),
  meaningful_interaction_count=greatest(relationship.meaningful_interaction_count,least(relationship.conversation_count,5)),
  conversation_session_count=greatest(relationship.conversation_session_count,coalesce((select count(*) from public.together_conversations conversation where conversation.character_instance_id=relationship.character_instance_id),0));

create or replace function public.kivelle_count_conversation_session() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind in('direct','first_meeting') then
    update public.together_relationship_states set conversation_session_count=conversation_session_count+1,updated_at=now() where character_instance_id=new.character_instance_id and user_id=new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists together_conversation_session_count on public.together_conversations;
create trigger together_conversation_session_count after insert on public.together_conversations for each row execute function public.kivelle_count_conversation_session();

alter table public.together_character_templates
  add column if not exists discovery_metadata jsonb not null default '{}'::jsonb,
  add column if not exists first_meeting jsonb not null default '{}'::jsonb;

alter table public.together_date_templates add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.together_character_templates template set
  discovery_metadata=jsonb_build_object('summary',template.biography,'goals',case when template.can_be_romanced then jsonb_build_array('Dating','Friendship','Stories') else jsonb_build_array('Friendship','Stories') end),
  first_meeting=case template.slug
    when 'maya' then jsonb_build_object('world_id','10000000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000001','title','The empty chair','setup','You are waiting for coffee when a photographer asks about the empty chair across from you.','companion_activity','taking a break between shoots','mood','playful','opening_line','Is anyone sitting here?')
    when 'sofia' then jsonb_build_object('world_id','10000000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000018','title','One last room','setup','At a gallery event, you and Sofia stop in front of the same unfinished-looking piece.','companion_activity','studying a gallery installation','mood','curious','opening_line','Tell me you see it too. Everyone keeps walking past the best piece in the room.')
    when 'avery' then jsonb_build_object('world_id','10000000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000014','title','Before the doors open','setup','Avery is fixing a last-minute production problem before a live set.','companion_activity','getting a live set back on schedule','mood','energized','opening_line','You look capable. Hold this for ten seconds and I might owe you a drink.')
    when 'riley' then jsonb_build_object('world_id','10000000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000019','title','The staff-pick argument','setup','You reach for the same staff-pick novel at Paper Trail.','companion_activity','rearranging a display they insist was already fine','mood','amused','opening_line','Take it. But if you hate the ending, I was never here.')
    when 'elena' then jsonb_build_object('world_id','10000000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000023','title','A better route','setup','Elena is studying a new public-space proposal in Alder District.','companion_activity','checking a design site','mood','focused','opening_line','Quick opinion: does this feel intentional, or expensive for no reason?')
    when 'harper' then jsonb_build_object('world_id','10000000-0000-4000-8000-000000000001','location_id','11000000-0000-4000-8000-000000000024','title','The wrong trail','setup','Harper catches you reading a park map upside down.','companion_activity','finishing a trail check','mood','warm','opening_line','I can let you keep pretending that map makes sense, or I can help.')
    else template.first_meeting
  end
where template.can_be_selected=true;

update public.together_date_templates set metadata=jsonb_build_object('completion_effects',jsonb_build_object('relationship_stage','dating'),'milestone_kind','first_date_invitation') where slug='dinner-at-juniper';

comment on column public.together_relationship_states.interaction_turn_count is 'All user turns. Never use as a user-facing relationship achievement.';
comment on column public.together_relationship_states.meaningful_interaction_count is 'Server-classified substantive interactions used for controlled milestone eligibility.';
comment on column public.together_character_templates.first_meeting is 'Content-authored first meeting scene. Generic companion creation must resolve this rather than a starter-world fallback.';

commit;
