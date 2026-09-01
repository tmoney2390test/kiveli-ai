begin;
select plan(6);

select has_function('public','kivelle_character_work_variants',array['jsonb','text','text'],'Work prose can be restored from canonical life configuration');
select has_function('public','kivelle_recovered_work_label',array['text','jsonb'],'Recovered work labels distinguish shifts, breaks, and home resets');
select is(public.kivelle_naturalize_character_activity('Reviewing a difficult case file','occupation_primary',null),'Reviewing a difficult case file','Specific work prose is never collapsed by its activity key');
select is(public.kivelle_recovered_work_label('post_work_reset','["Working a shift"]'::jsonb),'Unwinding at home after work','Post-work routines recover their actual meaning');
select is(public.kivelle_recovered_work_label('work_break','["Working a shift"]'::jsonb),'Taking a break at work','Work breaks recover their actual meaning');
select is(public.kivelle_recovered_work_label('occupation_primary','["Reviewing a difficult case file"]'::jsonb),'Reviewing a difficult case file','Occupation blocks recover authored prose');

select * from finish();
rollback;
