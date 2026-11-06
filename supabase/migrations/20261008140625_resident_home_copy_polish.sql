begin;

-- The later 20-resident packs in each published world used the same mechanical
-- room sentence followed by an occupation fragment. Replace only that copy;
-- retain each resident's existing home, district, image prompt, and lore.
with home_copy(world_slug,variant,description) as (
  values
  ('calders-run',0,'%1$s has a private room in %2$s. Dusty boots wait by the door, with a washstand and an oil lamp close to the bed. The room is theirs to return to after town business is done.'),
  ('calders-run',1,'%1$s keeps a room in %2$s with a narrow bed, a basin, and a chair pulled near the lamp. It is quiet enough to leave the street and its arguments outside for a while.'),
  ('calders-run',2,'%1$s has a small room in %2$s. A worn blanket, a place to wash, and boots set by the threshold make it feel lived in. The saloon and rail yard are separate places.'),
  ('eos-meridian',0,'%1$s has a private habitat room in %2$s. A task lamp lights the table, and a jacket hangs beside the bunk. The colony’s labs, gardens, and shared rooms are elsewhere.'),
  ('eos-meridian',1,'%1$s keeps a room in %2$s with a narrow bed, personal storage, and a cup left beside the light. It is a lived-in home, away from the colony’s public work areas.'),
  ('eos-meridian',2,'%1$s has a private room in %2$s. Folded bedding, storage hooks, and a scuffed desk give it the feel of someone who actually comes home. A chat does not place anyone inside.'),
  ('gilded-coast',0,'%1$s has private quarters in %2$s. Harbor air slips past the shutters, and a lantern and folded linen sit near the bed. The docks and taverns are outside.'),
  ('gilded-coast',1,'%1$s keeps a room in %2$s with worn floorboards, a washbasin, and a coat hung to dry. It is a place to sleep and be alone after the harbor’s noise dies down.'),
  ('gilded-coast',2,'%1$s has a private room in %2$s. A small lamp, a travel chest, and salt-worn shutters make it feel like a home rather than another public room by the water.'),
  ('juniper-city',0,'%1$s has a place of their own in %2$s. A jacket hangs by the door, and a mug and phone charger share the table. The city keeps moving outside the windows.'),
  ('juniper-city',1,'%1$s keeps a private home in %2$s. There is a lived-in couch, a little clutter on the counter, and somewhere to leave work behind when the door closes.'),
  ('juniper-city',2,'%1$s has a small home in %2$s. Shoes by the door and a half-finished drink on the table make it feel used, not staged. The public places in their day are elsewhere.'),
  ('neon-kyo',0,'%1$s has a private room in %2$s. Street light filters through the window, while a warm lamp and a jacket on the chair make the interior feel like theirs.'),
  ('neon-kyo',1,'%1$s keeps a home in %2$s with a low table, a charging cable, and a quiet corner away from the neon outside. Their work and the city’s crowds stay beyond the door.'),
  ('neon-kyo',2,'%1$s has a small private place in %2$s. Rain taps the window, shoes rest by the entrance, and a lamp stays on near the bed. It is not a public venue.'),
  ('northvale',0,'%1$s has a home in %2$s. Snow gear dries near the door, and a warm lamp lights the room after dark. The lodge and slopes are somewhere else.'),
  ('northvale',1,'%1$s keeps a private place in %2$s with boots by the threshold and a blanket close to the couch. Coming in from the mountain feels different here.'),
  ('northvale',2,'%1$s has a lived-in home in %2$s. There is space for a wet coat, a warm drink, and an ordinary evening out of the cold and away from work.'),
  ('port-vervelle',0,'%1$s has a private room in %2$s. Shutters hold back the bright harbor light, and a small table sits beside the bed. The marina is outside, not their bedroom.'),
  ('port-vervelle',1,'%1$s keeps a home in %2$s with cool stone underfoot and a window that lets in the sea air. It is a quiet place apart from the waterfront crowds.'),
  ('port-vervelle',2,'%1$s has a small private place in %2$s. A linen cover, a washbasin, and shutters against the afternoon sun make it feel used rather than staged.'),
  ('vespormoor',0,'%1$s has a private home in %2$s. Old walls hold a modern lamp, a coat by the door, and the ordinary things of a day in town. The public halls are elsewhere.'),
  ('vespormoor',1,'%1$s keeps a room in %2$s with worn timber, a warm light, and a few everyday belongings left out. It is home, not one of the town’s old institutions.'),
  ('vespormoor',2,'%1$s has a lived-in place in %2$s. Rain darkens the window, while a lamp and a chair near the bed make the room feel familiar instead of theatrical.'),
  ('vharadren',0,'%1$s has private quarters in %2$s. A lamp, a folded blanket, and boots by the threshold make the room useful after a long day. Court and market are elsewhere.'),
  ('vharadren',1,'%1$s keeps a room in %2$s with a narrow bed, woven cloth, and a small chest for personal things. It is separate from the halls where public duties happen.'),
  ('vharadren',2,'%1$s has a private place in %2$s. Firelight catches the rough walls, and a cloak hangs ready by the door. Nobody walks in without being invited.')
)
update public.together_character_homes home
set description=format(copy.description,template.name,coalesce((
      select district.name from public.together_locations district
      where district.id=home.district_anchor_location_id
    ),world.name)),
    updated_at=now()
from public.together_worlds world,
     public.together_character_versions version,
     public.together_character_templates template,
     home_copy copy
where home.world_id=world.id
  and home.character_version_id=version.id
  and version.character_template_id=template.id
  and copy.world_slug=world.slug
  and copy.variant=get_byte(decode(md5(template.slug),'hex'),0)%3
  and home.description ilike '%details stay ordinary and lived-in.%';

commit;
