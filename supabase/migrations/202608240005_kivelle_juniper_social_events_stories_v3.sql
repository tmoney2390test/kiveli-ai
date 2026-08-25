begin;

-- Juniper's active cast should feel like residents of one city, not a catalog
-- of unrelated profiles. These circles are authored knowledge boundaries: an
-- edge permits ordinary familiarity, never unrestricted memory sharing.
create temporary table juniper_social_circles(
  circle_slug text primary key,
  label text not null,
  member_slugs text[] not null
) on commit drop;

insert into juniper_social_circles values
('civic-city','civic and city-making circle',array['miranda-serrano','amara-okafor','gabriel-ortiz','leila-rahman','reese-morgan','vincent-hale','naomi-chen']),
('station-night','transit and station circle',array['noah-williams','omar-haddad','jules-navarro','kenji-sato','ethan-cole','tessa-morgan']),
('responders','medical and emergency-response circle',array['daniel-kim','talia-washington','priya-kapoor','mateo-alvarez','malcolm-reed','elena-markovic','avery-ellis']),
('market-table','food and market circle',array['javier-morales','camila-reyes','sophie-laurent','emma-callahan','luca-moretti']),
('riverside-regulars','riverside regulars',array['malcolm-reed','naomi-chen','caleb-bennett','brooke-sullivan','nia-brooks','zoe-bennett','darius-king','becka-shaw']),
('creative-night','creative and live-night circle',array['vincent-hale','tessa-morgan','nia-brooks','jade-nguyen','ethan-cole','luca-moretti','samira-haddad','claire-holloway','jules-navarro','darius-king']),
('college-green','younger campus and city circle',array['becka-shaw','lena-park','brooke-sullivan','zoe-bennett','jade-nguyen','samira-haddad','ethan-cole','emma-callahan','claire-holloway']),
('meridian-crew','training and recovery circle',array['avery-ellis','mateo-alvarez','priya-kapoor','elena-markovic','brooke-sullivan','talia-washington']),
('paper-trail','quiet arts and book circle',array['hannah-mercin','sophie-laurent','emma-callahan','lena-park','samira-haddad','kenji-sato','reese-morgan']);

do $$
declare missing_member_count integer;
begin
  select count(*) into missing_member_count
  from juniper_social_circles circle
  cross join lateral unnest(circle.member_slugs) member(slug)
  left join public.together_character_templates template on template.slug=member.slug
  where template.id is null;
  if missing_member_count<>0 then
    raise exception 'Juniper social circles contain % unresolved companions',missing_member_count;
  end if;
end $$;

with raw_pairs as(
  select circle.circle_slug,circle.label,source.slug source_slug,target.slug target_slug,
    row_number() over(partition by circle.circle_slug,source.slug order by array_position(circle.member_slugs,target.slug)) peer_rank
  from juniper_social_circles circle
  cross join lateral unnest(circle.member_slugs) source(slug)
  cross join lateral unnest(circle.member_slugs) target(slug)
  where source.slug<>target.slug
), ranked as(
  select distinct on(source_slug,target_slug) source_slug,target_slug,circle_slug,label,peer_rank,
    mod((hashtext(source_slug||':'||target_slug)::bigint&2147483647),5)::int affinity_rank
  from raw_pairs
  order by source_slug,target_slug,peer_rank,circle_slug
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '10000000-0000-4000-8000-000000000001',source.id,target.id,
  case ranked.affinity_rank when 0 then 'close_friend' when 1 then 'friend' when 2 then 'colleague' when 3 then 'acquaintance' else 'friendly_rival' end,
  case ranked.affinity_rank when 0 then 84 when 1 then 75 when 2 then 67 when 3 then 58 else 64 end,
  case ranked.affinity_rank when 0 then 83 when 1 then 74 when 2 then 71 when 3 then 55 else 59 end,
  source.name||' and '||target.name||' know each other through Juniper''s '||ranked.label||'. Their actual closeness and what they share remain specific to them.',
  jsonb_build_object('source','juniper_city_social_v3','circle',ranked.circle_slug,'memorySharing','event_only','knowledgeScope','relationship_and_shared_events','authored',true)
from ranked
join public.together_character_templates source on source.slug=ranked.source_slug
join public.together_character_templates target on target.slug=ranked.target_slug
on conflict(world_id,source_template_id,target_template_id) do update set
  relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,
  history=excluded.history,metadata=excluded.metadata,updated_at=now();

-- Family and unusually meaningful ties override the circle-derived defaults.
create temporary table juniper_special_edges(
  source_slug text,target_slug text,relationship_type text,affinity integer,trust integer,history text
) on commit drop;

insert into juniper_special_edges values
('reese-morgan','tessa-morgan','siblings',93,95,'Reese is Tessa''s older sibling. They share fast humor, stubborn loyalty, and a strict rule against using private family knowledge as public material.'),
('caleb-bennett','zoe-bennett','uncle_and_niece',91,92,'Caleb is Zoe''s uncle. He gave her access to empty Rivermark ballrooms when she needed rehearsal space; she refuses to let him hide behind hospitality polish.'),
('noah-williams','jules-navarro','trusted_shift_partners',88,91,'Noah and Jules have handled enough disrupted nights together to trust each other''s judgment without mistaking professional confidence for omniscience.'),
('daniel-kim','talia-washington','clinical_allies',89,94,'Daniel and Talia rely on one another during difficult hospital nights and deliberately protect an off-duty friendship from becoming another shift handoff.'),
('gabriel-ortiz','leila-rahman','policy_allies',82,84,'Gabriel and Leila can build a stronger city proposal together, though they disagree about how much political compromise a good plan should survive.'),
('malcolm-reed','naomi-chen','riverside_allies',86,88,'Mal and Naomi share practical responsibility for Riverside Landing and challenge each other whenever safety and public life are framed as opposites.'),
('javier-morales','camila-reyes','restaurant_friends',84,86,'Javier and Camila trade supplier warnings, closing-time meals, and blunt advice about keeping a restaurant personal without making it small.'),
('omar-haddad','samira-haddad','cousins',92,93,'Omar and Samira are cousins who exchange translations, transit stories, and family news while respecting each other''s independence.'),
('caleb-bennett','darius-king','old_friends',83,87,'Caleb and Darius have known each other through years of Rivermark events, late piano sets, and conversations that never required an audience.'),
('vincent-hale','tessa-morgan','media_colleagues',76,71,'Vincent and Tessa trade tips and argue about when a compelling local story becomes someone else''s private life.');

with directed as(
  select * from juniper_special_edges
  union all
  select target_slug,source_slug,relationship_type,affinity,trust,history from juniper_special_edges
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '10000000-0000-4000-8000-000000000001',source.id,target.id,
  edge.relationship_type,edge.affinity,edge.trust,edge.history,
  jsonb_build_object('source','juniper_city_special_edges_v3','memorySharing','event_only','authored',true)
from directed edge
join public.together_character_templates source on source.slug=edge.source_slug
join public.together_character_templates target on target.slug=edge.target_slug
on conflict(world_id,source_template_id,target_template_id) do update set
  relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,
  history=excluded.history,metadata=excluded.metadata,updated_at=now();

-- Keep the light-weight prompt graph aligned to canonical authored edges. This
-- is identity-aware public familiarity, never a copy of private conversations.
with active_versions as(
  select version.id,template.id template_id
  from public.together_character_world_presence presence
  join public.together_character_versions version on version.id=presence.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where presence.world_id='10000000-0000-4000-8000-000000000001'
    and presence.presence_type='resident' and template.published and template.lifecycle_status='published' and template.can_be_selected
), graphs as(
  select active.id version_id,coalesce(jsonb_agg(target.slug order by edge.affinity desc,target.slug),'[]'::jsonb) graph
  from active_versions active
  left join public.together_character_relationship_edges edge
    on edge.world_id='10000000-0000-4000-8000-000000000001' and edge.source_template_id=active.template_id
  left join public.together_character_templates target on target.id=edge.target_template_id
  group by active.id
)
update public.together_character_versions version
set default_social_graph=graphs.graph,updated_at=now()
from graphs where version.id=graphs.version_id;

-- Shared recurring rhythms give the social graph places and times to become
-- visible. They are context opportunities, never proof that attendance occurs.
create temporary table juniper_recurring_events(
  event_index integer,name text,event_type text,location_slug text,participant_slugs text[],probability numeric,
  duration_minutes integer,narrative_summary text,category text,tone text,recurrence jsonb
) on commit drop;

insert into juniper_recurring_events values
(1,'Juniper Civic Table','social','juniper-cafe',array['miranda-serrano','amara-okafor','gabriel-ortiz','leila-rahman','reese-morgan','vincent-hale','naomi-chen'],.68,120,'A Monday café table brings city-makers together without turning lunch into a formal hearing.','social','positive','{"frequency":"weekly","weekday":1,"startMinute":720}'::jsonb),
(2,'Responder Supper','social','ember-and-rye',array['daniel-kim','talia-washington','priya-kapoor','mateo-alvarez','malcolm-reed','elena-markovic','avery-ellis'],.62,120,'Midweek schedules occasionally align for an off-duty supper where difficult work can stay private.','relationship','emotional','{"frequency":"weekly","weekday":3,"startMinute":1140}'::jsonb),
(3,'Common Market Makers Morning','world','common-market',array['javier-morales','camila-reyes','sophie-laurent','emma-callahan','hannah-mercin','lena-park','samira-haddad','kenji-sato','reese-morgan'],.84,180,'Saturday market stalls gather cooks, makers, readers, and neighbors before the city scatters into the afternoon.','world','positive','{"frequency":"weekly","weekday":6,"startMinute":540}'::jsonb),
(4,'Static House Friday Set','social','static-house',array['vincent-hale','tessa-morgan','nia-brooks','jade-nguyen','ethan-cole','luca-moretti','samira-haddad','claire-holloway','jules-navarro','darius-king'],.82,240,'Friday''s Static House set crosses media, music, design, and nightlife circles without making everyone equally close.','social','exciting','{"frequency":"weekly","weekday":5,"startMinute":1260}'::jsonb),
(5,'Riverside Lights','social','riverside-landing',array['malcolm-reed','naomi-chen','caleb-bennett','brooke-sullivan','nia-brooks','zoe-bennett','darius-king','becka-shaw'],.73,180,'An early-evening Riverside Landing program mixes recreation, music, food, and people lingering after work.','social','romantic','{"frequency":"weekly","weekday":5,"startMinute":1080}'::jsonb),
(6,'College Green Saturday','social','halcyon-park',array['becka-shaw','lena-park','brooke-sullivan','zoe-bennett','jade-nguyen','samira-haddad','ethan-cole','emma-callahan','claire-holloway'],.76,180,'The younger Juniper circle drifts through an outdoor Saturday of study breaks, food, games, and changing plans.','social','funny','{"frequency":"weekly","weekday":6,"startMinute":900}'::jsonb),
(7,'Meridian Sunday Reset','social','meridian-fitness',array['avery-ellis','mateo-alvarez','priya-kapoor','elena-markovic','brooke-sullivan','talia-washington'],.65,120,'A loose Sunday training window lets Juniper''s active and emergency-work circles reset without becoming a mandatory group class.','health','positive','{"frequency":"weekly","weekday":0,"startMinute":600}'::jsonb),
(8,'Central Station Night Window','world','juniper-central-station',array['noah-williams','omar-haddad','jules-navarro','kenji-sato','ethan-cole','tessa-morgan'],.42,90,'A scheduled late service window draws operators, designers, commuters, and one reporter curious about what the city does after midnight.','world','surprising','{"frequency":"monthly","ordinal":2,"weekday":4,"startMinute":1320}'::jsonb);

do $$
declare missing_participant_count integer;
begin
  select count(*) into missing_participant_count
  from juniper_recurring_events event
  cross join lateral unnest(event.participant_slugs) member(slug)
  left join public.together_character_templates template on template.slug=member.slug
  where template.id is null;
  if missing_participant_count<>0 then
    raise exception 'Juniper recurring events contain % unresolved companions',missing_participant_count;
  end if;
end $$;

insert into public.together_event_templates(
  id,name,event_type,world_id,default_location_id,participant_template_ids,significance,probability,duration_minutes,
  narrative_summary,state_effects,user_visibility,proactive_eligible,metadata,active,category,tone,scale,content_level,conditions,followups
)
select ('3c000000-0000-4000-8001-'||lpad(event.event_index::text,12,'0'))::uuid,event.name,event.event_type,
  '10000000-0000-4000-8000-000000000001',location.id,
  array(select template.id from public.together_character_templates template where template.slug=any(event.participant_slugs)),
  .58,event.probability,event.duration_minutes,event.narrative_summary,'{}'::jsonb,'contextual',true,
  jsonb_build_object('worldSlug','juniper-city','worldEvent',true,'recurrence',event.recurrence,'scheduleAware',true,'source','juniper_city_cohesion_v3'),
  true,event.category,event.tone,'normal','standard',jsonb_build_object('recurrence',event.recurrence),'{}'::text[]
from juniper_recurring_events event
join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000001' and location.slug=event.location_slug
on conflict(id) do update set
  name=excluded.name,event_type=excluded.event_type,default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,probability=excluded.probability,duration_minutes=excluded.duration_minutes,
  narrative_summary=excluded.narrative_summary,metadata=excluded.metadata,conditions=excluded.conditions,active=true,updated_at=now();

-- Each previously story-empty expansion companion and each new companion gets
-- one bounded, dialogue-led personal thread. These arcs provide pressure and
-- choice; they do not make the user solve the character's life.
create temporary table juniper_character_stories(
  slug text,title text,lead_slug text,location_slugs text[],chapter_seeds text[],min_stage text,priority text
) on commit drop;

insert into juniper_character_stories values
('juniper-summer-after','The Summer After','brooke-sullivan',array['riverwalk','riverside-landing','juniper-college'],array['Brooke admits the seasonal routine cannot answer what comes after graduation.','A calendar collision makes the cost of saying yes to everything visible.','She chooses one next step without surrendering the social life she values.'],'friend','major'),
('juniper-field-report','The Field Report','becka-shaw',array['riverwalk','halcyon-park','juniper-college'],array['Becka finds river data that is less convenient than the adventurous version of the story.','A risky shortcut threatens the credibility of work she actually cares about.','She decides how to finish the project without letting caution become fear.'],'friend','major'),
('juniper-one-more-shift','One More Shift','mateo-alvarez',array['static-house','ember-and-rye'],array['Mateo realizes how often one more shift has replaced an actual personal plan.','A station obligation tests whether reliability always has to mean self-erasure.','He protects one part of his life without treating duty as the enemy.'],'friend','major'),
('juniper-case-she-carries','The Case She Carries','priya-kapoor',array['juniper-general-hospital','lucky-note'],array['Priya mentions a difficult outcome without asking to be rescued from it.','An off-duty reminder tests the boundaries she built around medicine.','She finds a personally honest way to carry the memory without bringing it into every room.'],'friend','major'),
('juniper-unclosed-file','The Unclosed File','elena-markovic',array['juniper-city-hall','northside-bar','meridian-fitness'],array['Elena notices a contradiction in an old closed case.','A plausible lead collides with her obligation not to manufacture certainty.','She decides what can responsibly be reopened and what remains unknown.'],'friend','major'),
('juniper-first-big-piece','The First Big Piece','jade-nguyen',array['needles-and-notes','static-house','glassline-gallery'],array['Jade is offered a career-making piece with conditions she does not respect.','A public preview forces craft, money, and authorship into the same room.','She defines the work she wants her name attached to.'],'friend','major'),
('juniper-second-location','Second Location','camila-reyes',array['sora-table','common-market','ember-and-rye'],array['Camila receives an expansion offer that flatters her success and threatens her way of working.','A difficult service reveals which constraints are real and which are investor talking points.','She chooses terms that protect both ambition and the room she built.'],'friend','major'),
('juniper-off-the-record','Off the Record','nia-brooks',array['juniper-civic-arena','static-house','riverside-landing'],array['Nia receives a tip that is compelling but not yet fair to air.','A source pressures her to choose speed over verification.','She decides what responsible boldness looks like when the scoreboard is invisible.'],'friend','major'),
('juniper-keep-the-room','Keep the Room','luca-moretti',array['static-house','lantern-dive'],array['Luca is offered money to turn Static House into a more predictable venue.','A difficult show demonstrates both the room''s fragility and its irreplaceable character.','He chooses what growth can look like without confusing nostalgia with principle.'],'friend','major'),
('juniper-story-she-wont-air','The Story She Won''t Air','tessa-morgan',array['side-street-comedy','paper-trail','static-house'],array['Tessa records a local story that is excellent audio and somebody else''s private life.','An editor pushes for the version with the cleanest narrative rather than the fairest truth.','She decides what not to publish and why restraint is still authorship.'],'friend','major'),
('juniper-last-train-north','Last Train North','noah-williams',array['juniper-central-station','riverside-landing'],array['Noah is offered a regional promotion that would move him away from station operations.','A severe delay reveals exactly what the station and team rely on him to provide.','He chooses a future based on belonging and ambition rather than guilt.'],'friend','major'),
('juniper-choice-after-midnight','The Choice After Midnight','daniel-kim',array['juniper-general-hospital','juniper-cafe'],array['Daniel is asked to lead a surgical program whose culture resembles the one that once exhausted him.','A long night tests whether his newer boundaries survive genuine need.','He defines leadership on terms that do not require becoming unavailable to his own life.'],'friend','major'),
('juniper-riverside-vote','The Riverside Vote','gabriel-ortiz',array['juniper-city-hall','riverside-landing','riverwalk'],array['Gabriel reveals the real tradeoff inside a major Riverside proposal.','Public testimony exposes both sincere fears and strategic misinformation.','He recommends a position he can defend without pretending compromise is neutral.'],'acquaintance','major'),
('juniper-high-water','High Water','malcolm-reed',array['riverside-landing','riverwalk'],array['Mal notices small safety signs that do not match the public forecast.','Rising water forces him to balance authority, evidence, and people who dislike being told to leave.','He names what the river taught him about control and chooses the next practical safeguard.'],'friend','major'),
('juniper-keep-it-small','Keep It Small','javier-morales',array['taqueria-lumen','common-market'],array['Javier receives an offer that could make Taquería Lumen famous and less his.','A crowded service shows which kinds of growth would help and which would hollow the place out.','He chooses a business direction without turning authenticity into fear.'],'friend','major'),
('juniper-anonymous-source','The Anonymous Source','vincent-hale',array['paper-trail','juniper-city-hall','northside-bar'],array['Vincent receives documents from a source whose motive is as important as the evidence.','Publishing quickly could expose real wrongdoing and an innocent private life.','He chooses what the public needs to know while accepting what cannot yet be proved.'],'friend','major'),
('juniper-signal-upgrade','The Signal Upgrade','omar-haddad',array['juniper-central-station','juniper-city-hall'],array['Omar''s accessibility upgrade is praised publicly and quietly cut in procurement.','A real service interruption reveals why the supposedly optional details matter.','He chooses whether to fight inside the process, outside it, or both.'],'friend','major'),
('juniper-rivermark-offer','The Rivermark Offer','caleb-bennett',array['rivermark-hotel','velvet-hour','riverside-landing'],array['Caleb is offered a prestigious hotel role in another city after years of making Rivermark his own.','A major event exposes how completely he has confused being needed with choosing to stay.','He makes one decision that belongs to the musician and man, not only the director.'],'friend','major'),
('juniper-accessible-city','The Accessible City','reese-morgan',array['juniper-city-hall','juniper-central-station','paper-trail'],array['Reese finds that a celebrated civic plan treats accessibility as a later phase.','A public walk-through makes the exclusion specific without reducing people to evidence.','They decide how to force a durable change without allowing the city to use their labor as decoration.'],'friend','major'),
('juniper-night-platform','Night Platform','jules-navarro',array['juniper-central-station','northside-bar'],array['Jules notices a repeating overnight platform anomaly everyone else has learned to ignore.','A maintenance window tests whether instinct can be translated into evidence.','They resolve the operational cause while admitting why the station at night matters personally.'],'friend','major'),
('juniper-closed-door-briefing','The Closed-Door Briefing','leila-rahman',array['juniper-city-hall','juniper-cafe'],array['Leila is invited into a private briefing whose proposed shortcut would be publicly indefensible.','Political allies argue that a compromised win is still a win.','She chooses a strategy and accepts the real cost rather than performing purity.'],'friend','major'),
('juniper-landing-season','The Landing Season','naomi-chen',array['riverside-landing','common-market','glassline-gallery'],array['Naomi is offered a budget large enough to reshape Riverside Landing and narrow who feels welcome there.','An event season exposes conflicts between access, art, commerce, and neighborhood use.','She authors a program with clear values instead of chasing universal approval.'],'friend','major'),
('juniper-unit-she-built','The Unit She Built','talia-washington',array['juniper-general-hospital','meridian-fitness'],array['Talia is offered an executive promotion away from the emergency floor.','A staffing crisis reveals both the strength of the unit she built and the danger of making herself indispensable.','She chooses how to lead next without asking another person to choose for her.'],'friend','major');

insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,chapters,
  cooldown_days,repeatable,priority,active,world_scope,specific_world_id
)
select story.slug,story.title,'personal',array[template.id],story.min_stage,
  jsonb_build_object('worldSlug','juniper-city','characterSlugs',jsonb_build_array(story.lead_slug),'locationSlugs',to_jsonb(story.location_slugs),'dialogueDriven',true,'requiresCorrectPlaceWhenAdvancing',false,'source','juniper_city_story_pack_v3'),
  (select jsonb_agg(jsonb_build_object(
    'id','chapter-'||ordinality,
    'title',case ordinality when 1 then 'The pressure appears' when 2 then 'The choice becomes real' else 'A choice of their own' end,
    'userVisibility',case when ordinality=1 then 'contextual' else 'visible' end,
    'mayTriggerProactiveMessage',true,'mayCreateMoment',ordinality=array_length(story.chapter_seeds,1),
    'narrativeSeed',seed,'minimumHoursBeforeNext',case when ordinality=1 then 18 else 36 end,
    'eligibleCharacterSlugs',jsonb_build_array(story.lead_slug),'eligibleLocationSlugs',to_jsonb(story.location_slugs)
  ) order by ordinality) from unnest(story.chapter_seeds) with ordinality chapter(seed,ordinality)),
  90,false,story.priority,true,'specific','10000000-0000-4000-8000-000000000001'
from juniper_character_stories story
join public.together_character_templates template on template.slug=story.lead_slug
on conflict(slug) do update set
  title=excluded.title,category=excluded.category,eligible_template_ids=excluded.eligible_template_ids,
  min_relationship_stage=excluded.min_relationship_stage,prerequisites=excluded.prerequisites,
  chapters=excluded.chapters,priority=excluded.priority,world_scope='specific',specific_world_id=excluded.specific_world_id,
  active=true,updated_at=now();

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'socialGraphStatus','interconnected_v3','recurringEventCount',8,
  'characterStoryArcCount',23,'residentRosterVersion',3
),updated_at=now()
where id='10000000-0000-4000-8000-000000000001';

do $$
declare thin_social_count integer;
declare event_count integer;
declare uncovered_event_count integer;
declare story_count integer;
begin
  with active as(
    select template.id
    from public.together_character_world_presence presence
    join public.together_character_versions version on version.id=presence.character_version_id
    join public.together_character_templates template on template.id=version.character_template_id
    where presence.world_id='10000000-0000-4000-8000-000000000001'
      and presence.presence_type='resident' and template.published and template.lifecycle_status='published' and template.can_be_selected
  ), degree as(
    select active.id,count(edge.id) degree_count
    from active left join public.together_character_relationship_edges edge
      on edge.world_id='10000000-0000-4000-8000-000000000001' and edge.source_template_id=active.id
    group by active.id
  ) select count(*) into thin_social_count from degree where degree_count<4;

  select count(*) into event_count from public.together_event_templates
  where metadata->>'source'='juniper_city_cohesion_v3' and active;

  with active as(
    select template.id
    from public.together_character_world_presence presence
    join public.together_character_versions version on version.id=presence.character_version_id
    join public.together_character_templates template on template.id=version.character_template_id
    where presence.world_id='10000000-0000-4000-8000-000000000001'
      and presence.presence_type='resident' and template.published and template.lifecycle_status='published' and template.can_be_selected
  ) select count(*) into uncovered_event_count from active
    where not exists(
      select 1 from public.together_event_templates event
      where event.metadata->>'source'='juniper_city_cohesion_v3' and active.id=any(event.participant_template_ids)
    );

  select count(*) into story_count from public.together_story_arc_templates
  where prerequisites->>'source'='juniper_city_story_pack_v3' and active;

  if thin_social_count<>0 or event_count<>8 or uncovered_event_count<>0 or story_count<>23 then
    raise exception 'Juniper cohesion invalid: thin social %, events %, uncovered %, stories %',thin_social_count,event_count,uncovered_event_count,story_count;
  end if;
end $$;

commit;
