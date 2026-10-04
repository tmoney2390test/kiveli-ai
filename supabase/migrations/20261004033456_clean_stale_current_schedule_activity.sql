-- A cached current_activity can outlive the event title that was repaired.
update public.together_character_instances
set current_activity=trim(regexp_replace(current_activity,
  '\s+while leaving room for the day to change naturally[.!]?$','','i')),
  updated_at=now()
where current_activity~*'\s+while leaving room for the day to change naturally[.!]?$';
