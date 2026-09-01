begin;
select plan(15);

select is(public.kivelle_naturalize_character_activity('Making private time for sketching'),'Making time for sketching','Interest time reads naturally');
select is(public.kivelle_naturalize_character_activity('Picking up a few practical things without rushing what comes next'),'Running a few errands at an easy pace','Slow errands lose generator scaffolding');
select is(public.kivelle_naturalize_character_activity('Picking up a few practical things while leaving room for the day to change naturally'),'Running a few errands with time to spare','Flexible errands lose generator scaffolding');
select is(public.kivelle_naturalize_character_activity('Winding down behind a closed privacy layer'),'Winding down at home','Privacy-layer mechanics do not leak into status');
select is(public.kivelle_naturalize_character_activity('Checking tomorrow and closing the privacy layer'),'Checking tomorrow''s plans before winding down','Night routine reads like human prose');
select is(public.kivelle_naturalize_character_activity('Taking a private afternoon at home'),'Having a quiet afternoon at home','Private-afternoon scaffold becomes natural');
select is(public.kivelle_naturalize_character_activity('Keeping a private nocturnal rhythm after the rest of town has gone quiet'),'Keeping late hours at home','Nocturnal scaffold becomes concise');
select is(public.kivelle_naturalize_character_activity('Catching Friday''s live set with the overlapping music, media, and design crowd'),'Catching Friday''s live set with friends from the local creative scene','Repeated social template becomes conversational');
select is(public.kivelle_naturalize_character_activity('Keeping Saturday open around common market'),'Spending Saturday around Common Market','Location labels are presented naturally');
select is(public.kivelle_naturalize_character_activity('Working as event producer'),'Working as an event producer','Occupation activity gains its article');
select is(public.kivelle_naturalize_character_activity('Working as dj and sound designer'),'Working as a DJ and sound designer','Initialism and article are repaired');
select is(public.kivelle_naturalize_character_activity('Reviewing a difficult case file'),'Reviewing a difficult case file','Specific authored prose remains unchanged');

select is((select count(*)::integer from public.together_schedule_templates where activity~*'(privacy layer|making private time|overlapping music, media, and design crowd)'),0,'Stored schedule labels contain no known generator scaffolding');
select is((select count(*)::integer from public.together_schedule_templates schedule cross join lateral jsonb_array_elements_text(coalesce(schedule.metadata->'activityVariants','[]'::jsonb)) variant where variant~*'(privacy layer|making private time|picking up a few practical things|overlapping music, media, and design crowd)'),0,'Stored schedule variants contain no known generator scaffolding');
select is((select count(*)::integer from public.together_event_templates where name like 'New album listen%' and narrative_summary<>'A new album turned a routine errand into a great find.'),0,'Repeated discovery events read naturally');

select * from finish();
rollback;
