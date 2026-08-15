begin;

-- Juniper City is the canonical free starter world. Preserve the stable UUID used by all
-- existing locations/history while bringing the public slug in line with the multi-world product.
update public.together_worlds
set slug='juniper-city',
    name='Juniper City',
    access_type='free',
    entitlement_key=null,
    updated_at=now()
where id='10000000-0000-4000-8000-000000000001';

-- Chloe and Alex were promoted to selectable launch companions after the original authored
-- first-meeting backfill. Give each a distinct canonical introduction instead of allowing
-- selectable companions to enter the simulation with an empty scene.
update public.together_character_templates
set first_meeting=jsonb_build_object(
      'world_id','10000000-0000-4000-8000-000000000001',
      'location_id','11000000-0000-4000-8000-000000000004',
      'title','First meeting at Northside Bar',
      'setup','You catch Chloe between conversations at Northside Bar, where she has already formed an opinion about the room and is deciding whether to share it.',
      'companion_activity','having a drink at Northside Bar',
      'mood','socially curious',
      'opening_line','You look like you are either having a much better night than everyone else or a much worse one. Which is it?',
      'suggested_prompts',jsonb_build_array('That obvious?','What did you decide about the room?')
    ),
    updated_at=now()
where slug='chloe' and published=true and can_be_selected=true
  and (first_meeting='{}'::jsonb or first_meeting is null or not(first_meeting ?& array['world_id','location_id','opening_line']));

update public.together_character_templates
set first_meeting=jsonb_build_object(
      'world_id','10000000-0000-4000-8000-000000000001',
      'location_id','11000000-0000-4000-8000-000000000005',
      'title','First meeting at Riverwalk',
      'setup','You and Alex pause at the same stretch of the Riverwalk after nearly passing each other twice, both pretending not to notice.',
      'companion_activity','walking along the Riverwalk',
      'mood','easygoing',
      'opening_line','Okay, twice is enough to make this officially weird. Hi.',
      'suggested_prompts',jsonb_build_array('I was about to say the same thing.','Do you walk here a lot?')
    ),
    updated_at=now()
where slug='alex' and published=true and can_be_selected=true
  and (first_meeting='{}'::jsonb or first_meeting is null or not(first_meeting ?& array['world_id','location_id','opening_line']));

commit;
