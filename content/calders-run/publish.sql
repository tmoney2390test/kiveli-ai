-- Run only after the reviewed frontend and Edge Functions have been deployed.
begin;
select pg_advisory_xact_lock(hashtext('calders-run-import'));
do $$
declare calder_world_id constant uuid := '31740169-035e-5b10-8c9d-98b206e9f24b';
begin
  if (select count(*) from together_character_versions where life_config->>'source'='calders_run_authoring_v1' and visual_identity->>'status'='reference_ready')<>49 then raise exception 'Calder portraits are not ready'; end if;
  if (select count(*) from together_locations l where l.world_id=calder_world_id and metadata->>'photoStatus'='ready')<>53 then raise exception 'Calder locations are not ready'; end if;
  if (select count(*) from together_schedule_templates where metadata->>'source'='calders_run_authoring_v1')<>2058 then raise exception 'Calder schedules are incomplete'; end if;
  if (select count(*) from together_world_canon_sources c where c.world_id=calder_world_id and content_type='story_arc')<>14 then raise exception 'Calder stories are incomplete'; end if;
  if (select count(*) from together_media_reference_assets a join storage.objects o on o.bucket_id=a.storage_bucket and o.name=a.storage_path where a.active and (a.source_key like 'location:calders-run:%' or a.source_key='world:calders-run:canonical' or a.character_version_id in(select id from together_character_versions where life_config->>'source'='calders_run_authoring_v1')))<>103 then raise exception 'Calder stored references are incomplete'; end if;
end $$;
update together_character_templates set published=true,can_be_selected=true,lifecycle_status='published' where discovery_metadata->>'source'='calders_run_authoring_v1';
update together_character_versions set published_at=coalesce(published_at,now()) where life_config->>'source'='calders_run_authoring_v1';
update together_worlds set published=true,metadata=metadata||'{"releaseStatus":"playable"}'::jsonb where slug='calders-run' and metadata->>'assetStatus'='ready';
commit;

