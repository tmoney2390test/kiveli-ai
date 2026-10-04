-- Existing app builds render server-authored relationship choices. Offer a
-- durable dismissal there as well as in the newer chat card's close control.
create or replace function public.kivelle_keep_in_touch_dismiss_choice()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.kind='keep_in_touch' and new.status='pending'
    and not coalesce(new.choices,'[]'::jsonb) @> '[{"id":"dismiss"}]'::jsonb then
    new.choices:=coalesce(new.choices,'[]'::jsonb)||
      '[{"id":"dismiss","label":"Dismiss","tone":"secondary"}]'::jsonb;
  end if;
  return new;
end;
$$;
revoke all on function public.kivelle_keep_in_touch_dismiss_choice() from public,anon,authenticated;

drop trigger if exists kivelle_keep_in_touch_dismiss_choice on public.together_relationship_milestones;
create trigger kivelle_keep_in_touch_dismiss_choice
before insert or update of choices,status on public.together_relationship_milestones
for each row execute function public.kivelle_keep_in_touch_dismiss_choice();

update public.together_relationship_milestones
set choices=choices||'[{"id":"dismiss","label":"Dismiss","tone":"secondary"}]'::jsonb,
  updated_at=now()
where kind='keep_in_touch' and status='pending'
  and not choices @> '[{"id":"dismiss"}]'::jsonb;
