begin;

-- A district was used as a stand-in for home in the adult cast schedules.
-- A null template location is resolved to each character's actual home by
-- legacyBlocks; it also keeps the profile from naming a public street as home.
update public.together_schedule_templates schedule
set location_id = null,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('displayLocation', 'Home', 'scheduleEditorialVersion', 'home_v2')
from public.together_locations place
where schedule.location_id = place.id
  and place.location_type <> 'residence'
  and (
    schedule.activity ~* '\mat home\M'
    or schedule.metadata->>'activityKey' in ('home', 'sleep')
       and schedule.metadata->>'source' = 'adult_cast_schedule_v2'
    or schedule.metadata->>'source' = 'adult_cast_schedule_v2'
       and schedule.metadata->>'activityKey' = 'leisure'
       and place.location_type in ('district', 'landmark')
       and schedule.activity in (
         'Making a drink and calling a friend', 'Repairing and choosing an outfit',
         'Listening to music', 'Playing a game', 'Cooking a meal', 'Tending plants',
         'Practicing dance steps', 'Tinkering with equipment',
         'Sketching and sorting images', 'Reading', 'Watching a film at home',
         'Exercising at home'
       )
  );

-- These Vharadren midday blocks repeated a generic sentence and sometimes
-- exposed a protected title. Keep the existing time and canonical place.
with task(character_slug, label) as (
  values
    ('asha-ren', 'Reviewing camp supply routes and the next council agenda'),
    ('brother-aldren', 'Meeting sanctuary visitors and checking petitions'),
    ('captain-seraphine-vale', 'Checking crew hires and supplies at Knifeharbor Market'),
    ('duchess-aveline-edevane', 'Reviewing estate petitions and border reports'),
    ('duchess-mirelle-greymere', 'Meeting coastal envoys and reviewing port reports'),
    ('garrick-holt', 'Updating the condemned records at Lantern Gallows'),
    ('joren-ash', 'Sorting courier routes and messages at the waystation'),
    ('kael-dravos', 'Checking ships and negotiating supplies at Ashen Docks'),
    ('king-edric-thornwall', 'Holding court and reviewing military reports'),
    ('lady-isolde-morcant', 'Reviewing ledger accounts and meeting clients'),
    ('lord-cassian-greymere', 'Reviewing foreign correspondence and treaty terms'),
    ('malrec-vale', 'Copying camp records and preparing council notes'),
    ('nerys-rowanleaf', 'Cataloging records and comparing family names'),
    ('prince-aurel-ravaryn', 'Meeting petitioners and reviewing court correspondence'),
    ('prince-lucien-vaelorian', 'Reading petitions and preparing responses'),
    ('princess-elara-thornwall', 'Reviewing supply lists and treaty correspondence'),
    ('queen-maerra-vaelorian', 'Holding court and deciding petitions'),
    ('queen-selene-ravaryn', 'Reviewing island reports and meeting advisers'),
    ('rhevan-crownsbane', 'Examining the battlefield for signs of dragon activity'),
    ('tamsin-quill', 'Comparing family records and preparing copies')
)
update public.together_schedule_templates schedule
set activity = task.label,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array(task.label),
                            'activityLabel', task.label, 'scheduleEditorialVersion', 'copy_v2')
from public.together_character_versions version,
     public.together_character_templates person,
     task
where schedule.character_version_id = version.id
  and version.character_template_id = person.id
  and person.slug = task.character_slug
  and schedule.metadata->>'source' = 'vharadren_authored_weekly_v1'
  and schedule.metadata->>'activityKey' = 'midday_anchor'
  and schedule.activity = 'Continuing work through the district’s active hours';

-- Evening activities should describe something a person could actually do
-- at the scheduled place. These places are already in the character roster.
with evening(place_slug, label) as (
  values
    ('briar-and-cup', 'Having supper at the Briar & Cup'),
    ('broken-spur-tavern', 'Having a meal at the Broken Spur'),
    ('chapel-iron-saint', 'Attending the evening service at the Chapel of the Iron Saint'),
    ('cinder-camp', 'Joining the evening meal at Cinder Camp'),
    ('dragonbone-citadel', 'Attending an evening court gathering at Dragonbone Citadel'),
    ('gilded-steps-market', 'Getting food at Gilded Steps Market'),
    ('green-hart-lodge', 'Having supper at Green Hart Hunt Lodge'),
    ('hollow-crown-grove', 'Walking through Hollow Crown Grove'),
    ('house-red-reeds', 'Listening to music at House of Red Reeds'),
    ('knifeharbor-market', 'Getting food at Knifeharbor Market'),
    ('lantern-gallows', 'Passing through Lantern Gallows after dusk'),
    ('motherleaf-sanctuary', 'Joining evening prayers at Motherleaf Sanctuary'),
    ('old-imperial-waystation', 'Exchanging news at Old Imperial Waystation'),
    ('saint-orlas-lighthouse', 'Watching the evening signal at Saint Orla’s Lighthouse'),
    ('saltfire-bazaar', 'Browsing the evening stalls at Saltfire Bazaar'),
    ('thornwall-keep', 'Joining the evening meal at Thornwall Keep'),
    ('unshackled-cup', 'Having supper at the Unshackled Cup'),
    ('widows-vineyard', 'Having supper at Widow’s Vineyard')
)
update public.together_schedule_templates schedule
set activity = evening.label,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array(evening.label),
                            'activityLabel', evening.label, 'scheduleEditorialVersion', 'copy_v2')
from public.together_locations place,
     evening
where schedule.location_id = place.id
  and place.slug = evening.place_slug
  and schedule.metadata->>'source' = 'vharadren_authored_weekly_v1'
  and schedule.metadata->>'activityKey' = 'evening_social'
  and schedule.activity like 'Spending%plausible allies, rivals, or regulars';

-- The battlefield and camp market close before these evening slots end.
-- Make those six blocks home-based instead of presenting a closed venue.
update public.together_schedule_templates schedule
set location_id = null,
    activity = 'Having supper and sorting the day’s notes at home',
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array('Having supper and sorting the day’s notes at home'),
                            'activityLabel', 'Having supper and sorting the day’s notes at home',
                            'displayLocation', 'Home', 'scheduleEditorialVersion', 'copy_v2')
from public.together_locations place
where schedule.location_id = place.id
  and place.slug in ('glass-battlefield', 'red-mare-camp-market')
  and schedule.metadata->>'source' = 'vharadren_authored_weekly_v1'
  and schedule.metadata->>'activityKey' = 'evening_social'
  and schedule.activity like 'Spending%plausible allies, rivals, or regulars';

-- Replace empty "personal routine" captions with a place-specific action.
with personal(place_slug, label) as (
  values
    ('weeping-archive', 'Reading old records at the Weeping Archive'),
    ('salt-widow-tavern', 'Meeting a contact for a meal at the Salt Widow'),
    ('broken-spur-tavern', 'Having a meal at the Broken Spur'),
    ('widows-vineyard', 'Walking the vineyard paths'),
    ('basilica-seven-flames', 'Attending prayers at the Basilica of Seven Flames'),
    ('gilded-steps-market', 'Browsing the stalls at Gilded Steps Market'),
    ('saltfire-bazaar', 'Buying supplies at Saltfire Bazaar'),
    ('knifeharbor-market', 'Meeting merchants at Knifeharbor Market'),
    ('hollow-crown-grove', 'Walking through Hollow Crown Grove'),
    ('old-imperial-waystation', 'Checking route notes at Old Imperial Waystation'),
    ('vault-nameless-kings', 'Reading memorial inscriptions at the vault'),
    ('motherleaf-sanctuary', 'Helping visitors at Motherleaf Sanctuary'),
    ('rootmarket', 'Buying herbs at Rootmarket'),
    ('caldera-hatchery', 'Visiting the Caldera Hatchery'),
    ('dragonbone-citadel', 'Reviewing public petitions at Dragonbone Citadel'),
    ('chapel-iron-saint', 'Attending prayers at the Chapel of the Iron Saint')
)
update public.together_schedule_templates schedule
set activity = personal.label,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array(personal.label),
                            'activityLabel', personal.label, 'scheduleEditorialVersion', 'copy_v2')
from public.together_locations place,
     personal
where schedule.location_id = place.id
  and place.slug = personal.place_slug
  and schedule.metadata->>'source' = 'vharadren_authored_weekly_v1'
  and schedule.activity ~* '^Following a personal .* routine$';

-- Juniper's Sunday label was repeated verbatim despite very different plans.
with sunday(place_slug, label) as (
  values
    ('riverwalk', 'Walking the river path on a day off'),
    ('meridian-fitness', 'Working out at Meridian Fitness'),
    ('common-market', 'Browsing the stalls at Common Market'),
    ('lucky-note', 'Listening to live music at Lucky Note'),
    ('juniper-cafe', 'Reading over coffee at Juniper Café'),
    ('glassline-gallery', 'Viewing the latest exhibition at Glassline Gallery')
)
update public.together_schedule_templates schedule
set activity = sunday.label,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array(sunday.label),
                            'activityLabel', sunday.label, 'scheduleEditorialVersion', 'copy_v2')
from public.together_locations place,
     sunday
where schedule.location_id = place.id
  and place.slug = sunday.place_slug
  and schedule.metadata->>'source' = 'juniper_city_authored_schedule_v3'
  and schedule.activity = 'Taking Sunday at an easy pace';

-- Reuse each coastal resident's authored home hobby for open home blocks.
with home(character_slug, label) as (
  values
    ('elara-voss', 'Sharpening a knife at home'),
    ('tomas-renn', 'Practicing a wooden flute at home'),
    ('anika-saye', 'Working through a puzzle at home'),
    ('rafiq-nadir', 'Baking bread at home'),
    ('mira-cael', 'Carving a small figure at home'),
    ('nico-solari', 'Practicing boat knots at home'),
    ('seraphine-vale', 'Tending orchids at home'),
    ('julian-mercer', 'Looking through old maps at home'),
    ('sabine-quill', 'Blending tea at home'),
    ('lucien-damar', 'Repairing a violin at home'),
    ('iria-montrose', 'Cutting a practice stone at home'),
    ('hugo-fen', 'Cooking an old recipe at home'),
    ('bruna-kest', 'Making a wooden toy at home'),
    ('mateo-salt', 'Drawing a sail pattern at home'),
    ('yara-nouri', 'Working on a rope puzzle at home'),
    ('dorian-pike', 'Carving wood at home'),
    ('levi-ash', 'Practicing ropework at home'),
    ('celia-mar', 'Tending plants at home'),
    ('inez-sol', 'Sketching a costume at home'),
    ('cassia-bloom', 'Restoring an old chair at home'),
    ('luca-vane', 'Writing a song at home'),
    ('fen-moreno', 'Arranging music at home'),
    ('javier-ro', 'Cooking supper at home'),
    ('maia-bel', 'Solving a wooden puzzle at home'),
    ('amara-kade', 'Drying herbs at home'),
    ('bastien-crow', 'Mending a net at home'),
    ('talia-wren', 'Watching seabirds from home'),
    ('oren-gale', 'Keeping a weather journal at home'),
    ('nera-tide', 'Carving a shell at home'),
    ('sami-haddad', 'Working a ledger puzzle at home'),
    ('mara-blackfin', 'Mending a net at home'),
    ('idris-vale', 'Practicing a song at home'),
    ('sora-bay', 'Cooking at home'),
    ('keon-flint', 'Looking over charts at home'),
    ('nadia-storm', 'Drawing at home'),
    ('elias-reed', 'Playing fiddle at home')
)
update public.together_schedule_templates schedule
set activity = home.label,
    metadata = coalesce(schedule.metadata, '{}'::jsonb)
      || jsonb_build_object('activityVariants', jsonb_build_array(home.label),
                            'activityLabel', home.label, 'scheduleEditorialVersion', 'copy_v2')
from public.together_character_versions version,
     public.together_character_templates person,
     home
where schedule.character_version_id = version.id
  and version.character_template_id = person.id
  and person.slug = home.character_slug
  and schedule.metadata->>'source' = 'gilded_coast_authored_weekly_v1'
  and schedule.activity in (
    'Having a private morning at home',
    'Taking a slow morning at home',
    'Spending the evening at home'
  );

commit;
