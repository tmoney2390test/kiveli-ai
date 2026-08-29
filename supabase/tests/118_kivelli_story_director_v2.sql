begin;

select plan(8);

select has_column('public', 'together_story_definitions', 'content_version', 'story definitions are versioned');
select has_column('public', 'together_story_definitions', 'persistence_policy', 'story definitions select a persistence adapter');
select has_column('public', 'together_story_campaigns', 'content_version', 'campaigns retain their authored content version');
select has_column('public', 'together_story_campaigns', 'persistence_policy', 'campaigns retain their persistence policy');
select is((select content_version from public.together_story_definitions where slug='the-last-night-in-vespormoor'), 2, 'Vespormoor story content is migrated to director v2');
select is((select persistence_policy from public.together_story_definitions where slug='the-last-night-in-vespormoor'), 'knowledge-persists-loop-resets', 'Vespormoor uses knowledge persistence');
select ok((select (metadata->>'normalMemoryIsolation')::boolean from public.together_story_definitions where slug='the-last-night-in-vespormoor'), 'normal companion memory remains isolated');
select is((select (metadata->>'coreCharacterCount')::integer from public.together_story_definitions where slug='the-last-night-in-vespormoor'), 12, 'all twelve core characters are declared');

select * from finish();
rollback;
