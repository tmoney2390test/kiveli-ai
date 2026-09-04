begin;
select plan(2);

select has_function('public','kivelle_reserve_video_generation_v7',array['uuid','uuid','uuid','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','boolean','integer','boolean','uuid'],'Bring-to-life reservation accepts an independently moderated effective content level');
select function_privs_are('public','kivelle_reserve_video_generation_v7',array['uuid','uuid','uuid','text','text','text','text','text','text','text','integer','numeric','numeric','integer','text','text','boolean','text','text','text','text','boolean','boolean','integer','boolean','uuid'],'authenticated',array[]::text[],'Clients cannot bypass server-side bring-to-life content authorization');

select * from finish();
rollback;
