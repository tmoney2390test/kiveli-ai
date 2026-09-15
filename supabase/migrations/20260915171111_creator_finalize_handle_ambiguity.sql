-- Qualify the returned handle; a same-named PL/pgSQL local made every new finalization roll back.
-- Patch the installed definition to preserve independently deployed creator behavior and grants.
do $migration$
declare
  definition text := pg_get_functiondef('public.kivelle_finalize_creator_draft(uuid,uuid,uuid)'::regprocedure);
  old_expression text := '(select public_handle from public.together_character_templates where id=template_id)';
  new_expression text := '(select created_template.public_handle from public.together_character_templates created_template where created_template.id=template_id)';
begin
  if position(old_expression in definition) = 0 then
    if position(new_expression in definition) = 0 then raise exception 'Creator finalization definition changed; inspect before patching'; end if;
    return;
  end if;
  execute replace(definition, old_expression, new_expression);
end;
$migration$;
