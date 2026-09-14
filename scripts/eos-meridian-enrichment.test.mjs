import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { characters, locations, dateScenes, worldFacts, storyArcs, recurringEvents, socialEdges, buildSchedules } from './eos-meridian-content.mjs';
import { characterEnrichment, chronology, venueLife, supportingResidents, relationshipPerspectives, editorialLocationLore } from './eos-meridian-enrichment.mjs';
import { openIntervals } from './eos-meridian-schedules.mjs';
import { renderEnrichmentMigration, migrationPath } from './build-eos-meridian-enrichment.mjs';

test('all pre-existing character material outside first meetings is byte-for-byte preserved',()=>{
  const originalCharacters=structuredClone(characters);
  for(const character of originalCharacters){
    delete character.firstMeeting;
    for(const key of ['editorialLife','currentGoals','ambitions','concerns'])delete character.characterBible[key];
  }
  const hash=createHash('sha256').update(JSON.stringify({characters:originalCharacters,dateScenes,adultFacts:worldFacts.filter(f=>f.contentLevel!=='standard')})).digest('hex');
  // Captured from ff04672 before this editorial pass, including spice, romance, boundaries and appearance.
  assert.equal(hash,'b693078539f8aabacc717262c04bacd31091afc075a908c3bf7de367d7518718');
});

test('47 residents have individual desires, dated histories, and distinct concrete openings',()=>{
  assert.equal(characters.length,47);
  assert.equal(Object.keys(characterEnrichment).length,47);
  assert.equal(new Set(characters.map(c=>c.firstMeeting.opener)).size,47);
  for(const character of characters){
    const life=character.characterBible.editorialLife;
    assert.equal(life.milestones.length,3);
    assert.equal(life.origin.birthYear,38-character.age);
    for(const milestone of life.milestones){assert.ok(milestone.year>=life.origin.birthYear);assert.ok(milestone.year<=38);}
    assert.ok(life.weeklyGoal&&life.ambition&&life.ordinaryWish&&life.relationshipTension&&life.privateConcern);
    assert.ok(locations.some(l=>l.slug===character.firstMeeting.locationSlug));
    assert.ok(!character.firstMeeting.opener.includes('has a reason to speak'));
    assert.match(life.knowledgeDiscipline,/Private|private/);
    assert.match(life.continuity,/player-session/);
  }
});

test('Year 20 repairs keep the first landing and childhood ages separate',()=>{
  assert.equal(chronology.presentYear,38);assert.equal(chronology.lyraEmergencyYear,20);
  for(const [slug,expected] of [['naomi-varga',28],['malik-orison',21],['luc-moreau',33],['jonah-sato',24],['commander-rhea-navarro',22]]){
    const character=characters.find(c=>c.slug===slug);
    assert.equal(character.age-18,expected);
  }
  assert.match(chronology.missingHours,/remain separate/);
});

test('every week covers each minute once, gives two days off, and respects venue hours',()=>{
  const schedules=buildSchedules();
  for(const character of characters){
    let daysOff=0;
    for(let day=0;day<7;day++){
      const blocks=schedules.filter(row=>row.characterVersionId===character.versionId&&row.dayOfWeek===day);
      assert.equal(blocks[0].startMinute,0);assert.equal(blocks.at(-1).endMinute,1440);
      if(blocks.every(row=>row.metadata.dayType==='rest_day'))daysOff++;
      blocks.forEach((block,index)=>{
        assert.ok(block.endMinute>block.startMinute);
        if(index)assert.equal(block.startMinute,blocks[index-1].endMinute);
        if(block.locationSlug){
          const location=locations.find(l=>l.slug===block.locationSlug);
          assert.ok(location,block.locationSlug);
          assert.ok(openIntervals(location).some(([start,end])=>block.startMinute>=start&&block.endMinute<=end),`${character.slug} ${block.locationSlug}`);
        }
      });
    }
    assert.equal(daysOff,2,character.slug);
  }
  const cassian=characters.find(c=>c.slug==='cassian-vale');
  assert.ok(!schedules.some(row=>row.characterVersionId===cassian.versionId&&row.locationSlug==='pioneer-memorial'&&/fencing/i.test(row.activity)));
});

test('enrichment uses existing lore fields, world locations and cast without new romance templates',()=>{
  assert.equal(Object.keys(venueLife).length,12);assert.equal(locations.length,54);
  for(const slug of Object.keys(venueLife)){
    const place=locations.find(l=>l.slug===slug);assert.ok(place,slug);
    const lore=editorialLocationLore(place);assert.ok(lore.publicHistory.length);assert.ok(lore.localEtiquette.length);assert.ok(lore.storySeeds.length);
  }
  for(const person of supportingResidents){assert.ok(person.age>=18);assert.ok(locations.some(l=>l.slug===person.locationSlug));assert.ok(!characters.some(c=>c.name===person.name));}
  for(const edge of relationshipPerspectives)assert.ok(socialEdges.some(e=>(e.source===edge.source&&e.target===edge.target)||(e.source===edge.target&&e.target===edge.source)),`${edge.source} -> ${edge.target}`);
});

test('six arcs have distinct bounded paths and no required romance',()=>{
  assert.equal(storyArcs.length,6);
  assert.equal(new Set(storyArcs.flatMap(a=>a.chapters.map(c=>c.title))).size,18);
  assert.equal(storyArcs.find(a=>a.slug==='eos-ghost-passenger').minStage,'friend');
  for(const arc of storyArcs){assert.equal(arc.chapters.length,3);assert.match(arc.chapters[2].narrativeSeed,/no decision|no decision/i);}
  assert.equal(recurringEvents.length,9);assert.equal(worldFacts.length,37);
  assert.match(recurringEvents.at(-1).summary,/not a permanent closure/);
});

test('committed additive migration is reproducible and does not mutate player state',()=>{
  const sql=renderEnrichmentMigration();assert.equal(readFileSync(migrationPath,'utf8').replace(/\r\n/g,'\n'),sql);
  for(const table of ['together_memories','together_shared_plans','together_character_instances','together_story_arc_instances','together_character_schedule_events'])assert.ok(!new RegExp(`(?:update|delete from|insert into) public\\.${table}\\b`,'i').test(sql),table);
  assert.match(sql,/protected character material/);
});
