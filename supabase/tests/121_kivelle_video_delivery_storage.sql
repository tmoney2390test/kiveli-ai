begin;
select plan(4);

select is(
  (select public from storage.buckets where id='together-user-media'),
  false,
  'generated video storage remains private'
);
select ok(
  (select file_size_limit>=80*1024*1024 from storage.buckets where id='together-user-media'),
  'the storage ceiling matches the server video limit'
);
select ok(
  (select 'video/mp4'=any(allowed_mime_types) from storage.buckets where id='together-user-media'),
  'MP4 video delivery is accepted'
);
select ok(
  (select 'video/webm'=any(allowed_mime_types) from storage.buckets where id='together-user-media'),
  'WebM video delivery is accepted'
);

select * from finish();
rollback;
