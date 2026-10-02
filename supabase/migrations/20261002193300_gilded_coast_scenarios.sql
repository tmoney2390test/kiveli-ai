-- Gilded Coast remains hidden until an explicit release; scenario rows are staged with it.
begin;
insert into public.together_scenario_definitions(id,character_template_id,world_id,location_id,title) values
('story-gilded-the-missing-fight-log','24000000-0000-4000-8014-000000000001','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000007','The Missing Fight Log'),
('story-gilded-the-ferry-seat','24000000-0000-4000-8014-000000000004','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000005','The Ferry Seat'),
('story-gilded-the-sail-with-two-names','24000000-0000-4000-8014-000000000014','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000017','The Sail With Two Names'),
('story-gilded-an-evening-bought-twice','24000000-0000-4000-8014-000000000019','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000025','An Evening Bought Twice'),
('story-gilded-the-lantern-that-went-dark','24000000-0000-4000-8014-000000000027','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000030','The Lantern That Went Dark'),
('story-gilded-the-reef-on-paper','24000000-0000-4000-8014-000000000034','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000042','The Reef on Paper'),
('story-gilded-the-salons-last-note','24000000-0000-4000-8014-000000000009','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000009','The Salon’s Last Note'),
('story-gilded-the-cargo-with-two-owners','24000000-0000-4000-8014-000000000003','10000000-0000-4000-8000-000000000014','2e000000-0000-4000-8014-000000000003','The Cargo With Two Owners')
on conflict(id) do update set character_template_id=excluded.character_template_id,world_id=excluded.world_id,location_id=excluded.location_id,title=excluded.title;
update public.together_story_arc_templates set prerequisites=coalesce(prerequisites,'{}'::jsonb)||'{"scenarioDriven":true}'::jsonb where specific_world_id='10000000-0000-4000-8000-000000000014'::uuid and slug in ('the-missing-fight-log','the-ferry-seat','the-sail-with-two-names','an-evening-bought-twice','the-lantern-that-went-dark','the-reef-on-paper','the-salons-last-note','the-cargo-with-two-owners');
commit;
