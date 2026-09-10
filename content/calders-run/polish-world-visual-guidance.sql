-- Idempotent content update; companion and story state are unchanged.
update together_worlds
set visual_context=jsonb_set(visual_context,'{avoid}',coalesce(visual_context->'avoid','[]'::jsonb)||'["trains approaching or crossing the unfinished bridge"]'::jsonb)
where id='31740169-035e-5b10-8c9d-98b206e9f24b'
  and not coalesce(visual_context->'avoid','[]'::jsonb) @> '["trains approaching or crossing the unfinished bridge"]'::jsonb;
