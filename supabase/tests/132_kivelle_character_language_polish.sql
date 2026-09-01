begin;
select plan(14);

select has_function('public','kivelle_naturalize_character_activity',array['text','text','text'],'Character activity has one canonical database normalizer');
select has_function('public','kivelle_naturalize_character_event_summary',array['text'],'Lifecycle summaries have a canonical normalizer');
select has_function('public','kivelle_naturalize_character_biography',array['text'],'Early biography scaffolding has a canonical repair');
select has_trigger('public','together_schedule_templates','kivelle_normalize_schedule_template_language','Authored schedules are normalized on write');
select has_trigger('public','together_character_activity_templates','kivelle_normalize_activity_template_language','Generated activity templates are normalized on write');
select has_trigger('public','together_character_schedule_events','kivelle_normalize_materialized_schedule_language','Materialized schedules are normalized on write');
select has_trigger('public','together_character_templates','kivelle_normalize_character_biography','Published and custom biographies are repaired on write');

select is(public.kivelle_naturalize_character_activity('Taking private time at home'),'Having some quiet time at home','Private-time scaffolding becomes natural status');
select is(public.kivelle_naturalize_character_activity('Following Thursday at Lakehouse Cafe without forcing the pace'),'Spending some time at Lakehouse Cafe','Day/location scaffolding is removed');
select is(public.kivelle_naturalize_character_activity('Friday Evening Around Ember-And-Rye'),'Spending Friday evening at Ember And Rye','Location slugs cannot leak into activity labels');
select is(public.kivelle_naturalize_character_activity('Event Producer','work','Event Producer'),'At work','Occupation nouns cannot be used as grammatical activities');
select is(public.kivelle_naturalize_character_event_summary('Becka Shaw finishes Sleeping at home at 10:00 AM.'),'Becka Shaw wakes up around 10:00 AM.','Sleep completion reads like human prose');
select is(public.kivelle_naturalize_character_biography('Jonah Sato, 42, is a memorial curator. warm and patient. He found an altered archive.'),'Jonah Sato is a memorial curator. Jonah Sato is warm and patient. He found an altered archive.','Compact biography scaffolding becomes prose');
select is(public.kivelle_naturalize_character_activity('Reviewing a difficult case file'),'Reviewing a difficult case file','Specific authored activity survives normalization');

select * from finish();
rollback;
