begin;

alter table public.together_notification_preferences
  add column if not exists initiative_level text not null default 'natural',
  add column if not exists companion_initiative_levels jsonb not null default '{}'::jsonb;

update public.together_notification_preferences
set initiative_level=case when character_initiated_messages then 'natural' else 'off' end
where character_initiated_messages=false
   or initiative_level is null
   or initiative_level not in('off','occasional','natural','frequent');

alter table public.together_notification_preferences
  drop constraint if exists together_notification_preferences_initiative_level_check,
  add constraint together_notification_preferences_initiative_level_check
    check(initiative_level in('off','occasional','natural','frequent')),
  drop constraint if exists together_notification_preferences_companion_initiative_levels_check,
  add constraint together_notification_preferences_companion_initiative_levels_check
    check(
      jsonb_typeof(companion_initiative_levels)='object'
      and not jsonb_path_exists(
        companion_initiative_levels,
        '$.keyvalue().value ? (@ != "off" && @ != "occasional" && @ != "natural" && @ != "frequent")'
      )
    );

comment on column public.together_notification_preferences.initiative_level
  is 'Paid companion-initiated message pacing: off, occasional, natural, or frequent. Plan reminders remain independent.';
comment on column public.together_notification_preferences.companion_initiative_levels
  is 'Optional character-instance keyed initiative pacing overrides owned by the user.';

commit;
