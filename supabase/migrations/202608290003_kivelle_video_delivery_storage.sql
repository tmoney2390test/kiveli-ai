begin;

-- Video generation finalizes into the same private, user-scoped media bucket
-- as photos and voice notes. Keep the bucket policy private while allowing the
-- formats and maximum size already enforced by the server finalizer.
update storage.buckets
set file_size_limit=greatest(coalesce(file_size_limit,0),80*1024*1024),
    allowed_mime_types=array(
      select distinct mime
      from unnest(coalesce(allowed_mime_types,'{}'::text[])||array['video/mp4','video/webm']) as mime
      order by mime
    )
where id='together-user-media';

commit;
