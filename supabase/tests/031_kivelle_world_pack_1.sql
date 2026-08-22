begin;
select plan(9);

select is((select count(*)::integer from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren')),6,'retired world rows remain as historical tombstones');
select is((select count(*)::integer from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren') and published),0,'retired worlds are absent from the published catalog');
select is((select count(*)::integer from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren') and featured),0,'retired worlds cannot be featured');
select is((select count(*)::integer from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren') and coalesce((metadata->>'retired')::boolean,false)),6,'every legacy world carries an explicit retirement marker');
select is((select count(*)::integer from public.together_locations where world_id in(select id from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren'))),120,'legacy canonical locations remain available to historical records');
select is((select count(*)::integer from public.together_event_templates where world_id in(select id from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren')) and active),0,'retired event templates are inactive');
select is((select count(*)::integer from public.together_story_arc_templates where specific_world_id in(select id from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren')) and active),0,'retired story arcs are inactive');
select is((select count(*)::integer from public.together_date_templates where world_id in(select id from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren')) and active),0,'retired dates are inactive');
select is((select count(*)::integer from public.together_trip_templates where world_id in(select id from public.together_worlds where slug in('vesper-city','solara-coast','kairo','alder-ridge','aurelia','isla-maren')) and active),0,'retired trip templates are inactive');

select * from finish();
rollback;
