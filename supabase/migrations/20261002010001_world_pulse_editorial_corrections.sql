-- Preserve an immutable publication while allowing an explicit, audited
-- correction to its presentation and later chat handoff context.
create table public.together_world_pulse_editorial_corrections (
  occurrence_id uuid primary key references public.together_world_pulse_occurrences(id),
  title text not null,
  feed_summary text not null,
  detail_body text not null,
  group_message text,
  facts jsonb not null,
  participant_copy jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.together_world_pulse_editorial_corrections enable row level security;
revoke all on public.together_world_pulse_editorial_corrections from public, anon, authenticated;
grant select, insert on public.together_world_pulse_editorial_corrections to service_role;

create or replace function public.kivelle_world_pulse_apply_editorial_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_correction public.together_world_pulse_editorial_corrections%rowtype;
  v_user_visible jsonb;
begin
  select * into v_correction from public.together_world_pulse_editorial_corrections
    where occurrence_id = new.occurrence_id;
  if not found then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', fact->>'id', 'text', fact->>'text')), '[]'::jsonb)
    into v_user_visible from jsonb_array_elements(v_correction.facts) fact
    where fact->>'userVisible' = 'true';
  new.context_snapshot = new.context_snapshot || jsonb_build_object(
    'title', v_correction.title,
    'detailBody', v_correction.detail_body,
    'userVisibleFacts', v_user_visible
  );
  return new;
end $$;
create trigger together_world_pulse_editorial_link
  before insert on public.together_world_pulse_conversation_links
  for each row execute function public.kivelle_world_pulse_apply_editorial_link();
