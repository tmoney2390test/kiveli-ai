begin;

-- A normal Life is still unique per Persona, while subscriber chat paths
-- deliberately share the source Persona and are distinguished by kind.
drop index if exists public.together_continuities_one_life_per_persona_idx;
create unique index together_continuities_one_life_per_persona_idx
  on public.together_continuities(user_id,persona_id)
  where kind <> 'branch';

comment on index public.together_continuities_one_life_per_persona_idx is
  'One main or alternate Life per Persona; branch Lives may share their source Persona.';

commit;
