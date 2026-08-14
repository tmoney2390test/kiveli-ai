-- Existing Maya relationships receive locked sessions for the newly authored experiences.
insert into public.together_date_sessions(user_id,character_instance_id,date_template_id,status)
select instance.user_id,instance.id,template.id,'locked'
from public.together_character_instances instance
join public.together_character_templates character on character.id=instance.character_template_id and character.slug='maya'
cross join public.together_date_templates template
where template.active
on conflict(user_id,character_instance_id,date_template_id) do nothing;
