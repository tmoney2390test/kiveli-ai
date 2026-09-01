-- Character-scoped event templates inherit the base name with a suffix.
-- Keep their narrative copy in sync with the natural-language base event.

update public.together_event_templates
set narrative_summary='A new album turned a routine errand into a great find.',updated_at=now()
where name like 'New album listen%'
  and narrative_summary='A new album made an ordinary errand feel like a find.';
