-- Account exports are private ZIP artifacts in the existing user-media bucket.
update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 100 * 1024 * 1024),
    allowed_mime_types = array(
      select distinct mime
      from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['application/zip']) as mime
    )
where id = 'together-user-media';
