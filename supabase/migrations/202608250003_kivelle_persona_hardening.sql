begin;

-- Keep every Life attached to a Persona owned by the same account even when a
-- future server writer bypasses the Edge Function validation layer.
create or replace function public.kivelle_validate_continuity_persona_owner()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.together_user_personas persona
    where persona.id=new.persona_id and persona.user_id=new.user_id
  ) then
    raise exception 'Continuity Persona must belong to the same user.' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists together_continuities_validate_persona_owner on public.together_continuities;
create trigger together_continuities_validate_persona_owner
before insert or update of user_id,persona_id on public.together_continuities
for each row execute function public.kivelle_validate_continuity_persona_owner();

update public.together_user_personas
set communication_config=communication_config || jsonb_build_object(
  'responseLength',case when communication_config->>'responseLength' in('concise','balanced','detailed') then communication_config->>'responseLength' else 'balanced' end,
  'questionFrequency',case when communication_config->>'questionFrequency' in('low','natural','high') then communication_config->>'questionFrequency' else 'natural' end,
  'tone',case when communication_config->>'tone' in('gentle','natural','direct') then communication_config->>'tone' else 'natural' end
),
updated_at=now();

create index if not exists together_continuities_user_persona_idx
  on public.together_continuities(user_id,persona_id);

comment on column public.together_user_personas.communication_config is
  'User-controlled conversation delivery preferences. Values are data, never model instructions.';
comment on column public.together_user_personas.appearance_config is
  'Persona-specific presentation metadata, including a private together-user-media avatarPath.';

commit;
