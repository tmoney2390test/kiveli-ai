-- Promote the three fully art-directed launch characters to valid first companions.
update public.together_character_templates
set character_role='primary_companion',
    can_be_selected=true,
    can_be_romanced=true,
    updated_at=now()
where slug in ('maya','chloe','alex');
