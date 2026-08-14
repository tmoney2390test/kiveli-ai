-- People-first product architecture: explicit character roles and selection capabilities.
alter table public.together_character_templates
  add column if not exists character_role text not null default 'social_character',
  add column if not exists can_be_selected boolean not null default false,
  add column if not exists can_be_romanced boolean not null default false;

alter table public.together_character_templates drop constraint if exists together_character_templates_role_check;
alter table public.together_character_templates add constraint together_character_templates_role_check
  check(character_role in ('primary_companion','romanceable_companion','social_character')) not valid;
alter table public.together_character_templates validate constraint together_character_templates_role_check;

update public.together_character_templates
set character_role='primary_companion',can_be_selected=true,can_be_romanced=true,updated_at=now()
where slug in ('maya','sofia','avery','riley','elena','harper');

update public.together_character_templates
set character_role='social_character',can_be_selected=false,can_be_romanced=false,updated_at=now()
where slug not in ('maya','sofia','avery','riley','elena','harper');

update public.together_worlds
set name='Juniper City',description='People, places, and stories moving around you.',updated_at=now()
where slug='city-life';

create index if not exists together_character_templates_discoverable_idx
  on public.together_character_templates(published,can_be_selected,character_role);

comment on column public.together_character_templates.character_role is 'Product role. Companion selection is separate from server-side AI provider routing.';
comment on column public.together_character_templates.can_be_selected is 'Whether a user may explicitly begin and activate a relationship with this character.';
comment on column public.together_character_templates.can_be_romanced is 'Application-owned relationship capability; never an AI provider/model selection.';
