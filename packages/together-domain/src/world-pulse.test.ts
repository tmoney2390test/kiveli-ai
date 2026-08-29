import {describe,expect,it} from 'vitest';
import {buildAroundTownFeed,selectWorldPulseForContext,stableWorldPulseHash,temporalContinuitySummary,worldPulsePlanBoost,type WorldPulseEvent} from './world-pulse';

const NOW=new Date('2026-08-29T20:00:00Z');
function event(overrides:Partial<WorldPulseEvent>={}):WorldPulseEvent{return{id:'event',templateId:'template',worldId:'world',locationId:'pier',districtLocationId:null,title:'Stillwater Sessions',summary:'Owen is playing an intimate waterfront set.',eventType:'performance',startsAt:'2026-08-29T19:00:00Z',endsAt:'2026-08-29T22:00:00Z',status:'active',knowledgeScope:'public',significance:.75,topicTags:['music','waterfront'],activityTags:['live music'],participantCharacterInstanceIds:['owen'],participantNames:['Owen'],locationName:'Stillwater House',locationSlug:'stillwater-house',planAffordances:{reason:'Live music is happening tonight.'},...overrides};}

describe('world pulse',()=>{
  it('keeps unrelated ambient events out of casual dialogue',()=>{expect(selectWorldPulseForContext([event()],{now:NOW,userMessage:'hey',currentLocationId:'elsewhere'})).toEqual([]);});
  it('selects a current-location event and preserves participant truth',()=>{const [selected]=selectWorldPulseForContext([event()],{now:NOW,userMessage:'What is happening here?',currentLocationId:'pier',characterInstanceId:'owen'});expect(selected?.reasonCodes).toEqual(expect.arrayContaining(['active_now','current_location','character_participant']));});
  it('never leaks a private event to a nonparticipant',()=>{expect(selectWorldPulseForContext([event({knowledgeScope:'private'})],{now:NOW,userMessage:'What is happening?',currentLocationId:'pier',characterInstanceId:'other'})).toEqual([]);});
  it('builds an actionable, active-first feed',()=>{const feed=buildAroundTownFeed([event(),event({id:'later',startsAt:'2026-08-29T23:00:00Z',endsAt:'2026-08-30T01:00:00Z'})],{now:NOW});expect(feed.map((item)=>item.kind)).toEqual(['happening_now','later_today']);expect(feed[0]?.action).toBe('open_place');});
  it('keeps insider and private events out of the user feed',()=>{expect(buildAroundTownFeed([event({id:'insider',knowledgeScope:'insider'}),event({id:'private',knowledgeScope:'private'})],{now:NOW})).toEqual([]);});
  it('boosts plans at places with relevant activity',()=>{expect(worldPulsePlanBoost('pier',[event()],NOW)).toEqual({score:2,reason:'Live music is happening tonight.'});});
  it('reports only intervening temporal events',()=>{const result=temporalContinuitySummary({lastMessageAt:'2026-08-29T16:00:00Z',now:NOW,events:[{title:'Old',summary:'Earlier',startsAt:'2026-08-29T15:00:00Z'},{title:'New',summary:'Since then',startsAt:'2026-08-29T18:00:00Z'}]});expect(result.events.map((item)=>item.title)).toEqual(['New']);expect(result.elapsedHours).toBe(4);});
  it('uses stable simulation hashing',()=>{expect(stableWorldPulseHash('same')).toBe(stableWorldPulseHash('same'));expect(stableWorldPulseHash('same')).not.toBe(stableWorldPulseHash('different'));});
});
