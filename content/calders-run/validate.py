#!/usr/bin/env python3
"""Validate the delivered authoring pack; does not claim production integration."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json, re

ROOT=Path(__file__).resolve().parent
PACK=ROOT/'calders_run_content_pack.json'
data=json.loads(PACK.read_text(encoding='utf-8'))
checks=[]
errors=[]

def check(name,condition,detail=''):
    checks.append(dict(name=name,passed=bool(condition),detail=detail))
    if not condition:errors.append(name+(': '+detail if detail else ''))

def minute(t):
    a,b=map(int,t.split(':'));return 60*a+b

def opened(p,start,end):
    h=p['visitorHours'];a,b=minute(h['opens']),minute(h['closes'])
    if a==0 and b==1440:return True
    if b<=a:return (start>=a and end<=1440) or (start>=0 and end<=b)
    return a<=start and end<=b

chars={c['id']:c for c in data['characters']}
locs={l['id']:l for l in data['locations']}
places={k:v for k,v in locs.items() if v['nodeType']=='place'}
districts={k:v for k,v in locs.items() if v['nodeType']=='district'}
homes={h['id']:h for h in data['homes']}
events={e['id']:e for e in data['recurringEvents']}
arcs={a['id']:a for a in data['storyArcs']}
facts={f['id']:f for f in data['worldFacts']}
all_sites={**locs,**homes}
by_num={c['authoringNumber']:c for c in chars.values()}
place_num={p['authoringNumber']:p for p in places.values()}
genders=Counter(c['gender'] for c in chars.values())
spices=Counter(c['spiceLevel'] for c in chars.values())
ages=Counter('18-22' if c['age']<=22 else '23-50' for c in chars.values())
counts=data['world']['counts']
check('49 unique companions',len(chars)==len(data['characters'])==49)
check('Gender allocation',genders=={'woman':32,'man':17},str(dict(genders)))
check('Age allocation',ages=={'18-22':29,'23-50':20},str(dict(ages)))
check('Adult range covers 18 through 50',min(c['age'] for c in chars.values())==18 and max(c['age'] for c in chars.values())==50 and all(18<=c['age']<=50 for c in chars.values()))
check('Younger women and men',sum(c['gender']=='woman' and c['age']<=22 for c in chars.values())==21 and sum(c['gender']=='man' and c['age']<=22 for c in chars.values())==8)
check('Spice allocation 3 / 2 / 1',spices=={3:24,2:15,1:10},str(dict(spices)))
check('Largest-remainder rounding',data['world']['spiceAllocation']['3']==24 and data['world']['spiceAllocation']['2']==15 and data['world']['spiceAllocation']['1']==10)
check('47 places and six district nodes',len(places)==47 and len(districts)==6 and len(locs)==53)
check('46 public-frontage places and one gated hideout',sum(p['access']['mode']=='public_frontage' for p in places.values())==46 and sum(p['access']['mode']=='story_gated' for p in places.values())==1)
check('Core 45 each matched to a distinct place',len({by_num[i]['primaryLocationId'] for i in range(1,46)})==45)
check('Two male bandits at Crowcut Hollow',all(by_num[i]['gender']=='man' and by_num[i]['primaryLocationId']==place_num[47]['id'] for i in (46,47)))
check('Two female workers at the Red Sash',all(by_num[i]['gender']=='woman' and by_num[i]['primaryLocationId']==place_num[46]['id'] and 'Brothel sex worker' in by_num[i]['occupation'] for i in (48,49)))
check('Bess and Sabine are unrelated',by_num[49]['id'] not in by_num[48]['relationship']['kinshipCharacterIds'] and by_num[48]['id'] not in by_num[49]['relationship']['kinshipCharacterIds'])
check('Private rooms counted separately',len(homes)==49 and not (homes.keys() & locs.keys()) and all(h['publicMapVisible'] is False and h['access']=='specific_invitation_only' for h in homes.values()))
check('Every character has one own room',all(c['homeId'] in homes and homes[c['homeId']]['ownerCharacterId']==c['id'] for c in chars.values()))
check('Every primary place exists',all(c['primaryLocationId'] in places for c in chars.values()))
check('Every place has valid district and companions',all(p['parentLocationId'] in districts and all(c in chars for c in p['primaryCharacterIds']+p['regularCharacterIds']) for p in places.values()))
check('Every place has a primary companion',all(p['primaryCharacterIds'] for p in places.values()))
check('Primary place mapping agrees in both directions',all(c['id'] in places[c['primaryLocationId']]['primaryCharacterIds'] for c in chars.values()))
check('Home district and parent exist',all(h['parentPublicPlaceId'] in places and h['districtId']==places[h['parentPublicPlaceId']]['parentLocationId'] for h in homes.values()))
check('Detailed profiles complete',all(len(c['biography'].split())>=75 and len(c['personalityTraits'])==5 and len(c['interests'])==5 and len(c['workActivities'])==6 and len(c['anecdotes'])==2 for c in chars.values()))
check('Four unique voice examples per companion',all(len({c['voice'][x] for x in ('openingLine','casualLine','conflictLine','earnedAffectionLine')})==4 for c in chars.values()))
check('Distinct character biographies and openings',len({c['biography'] for c in chars.values()})==49 and len({c['voice']['openingLine'] for c in chars.values()})==49)
check('Place history, layout, social texture, and story material present',all(all(p[k].strip() for k in ('history','layout','socialTexture','authorOnlyPrivateTruth')) and len(p['visualAnchors'])==4 and len(p['activities'])==4 and len(p['storySeeds'])==2 for p in places.values()))

entity_keys=['locations','homes','characters','factions','weeklySchedules','recurringEvents','socialConnections','worldFacts','dialogueOpportunities','interactionBeats','storyArcs','dateBlueprints']
entity_ids=[x['id'] for key in entity_keys for x in data[key]]
entity_ids += [a['id'] for c in chars.values() for a in c['anecdotes']]
entity_ids += [cl['id'] for a in arcs.values() for cl in a['clues']]
check('All entity IDs unique across types',len(entity_ids)==len(set(entity_ids)))
check('Stable slugs unique within character and place types',len({c['slug'] for c in chars.values()})==49 and len({p['slug'] for p in locs.values()})==53)

bonds=data['socialConnections']
pairs={(e['characterId'],e['otherCharacterId']):e for e in bonds}
check('334 distinct directed social connections',len(bonds)==len(pairs)==334)
check('Social endpoints exist and are distinct',all(a in chars and b in chars and a!=b for a,b in pairs))
check('Social reciprocity preserves shared facts',all((b,a) in pairs and e['sharedFacts']==pairs[(b,a)]['sharedFacts'] for (a,b),e in pairs.items()))
degree=Counter(a for a,b in pairs)
check('At least five authored connections per character',all(degree[c]>=5 for c in chars),f'Minimum degree: {min(degree.values())}')
check('Family bonds excluded from NPC romance',sum(bool(e['kinship']) for e in bonds)==10 and all(not e['npcRomancePermitted'] for e in bonds if e['kinship']))
check('Kinship arrays agree with bond records',all(c['relationship']['kinshipCharacterIds']==[e['otherCharacterId'] for e in bonds if e['characterId']==c['id'] and e['kinship']] for c in chars.values()))

rows=data['weeklySchedules']
groups=defaultdict(list)
for row in rows:groups[(row['characterId'],row['dayOfWeek'])].append(row)
check('2,058 baseline schedule rows',len(rows)==2058 and len(groups)==49*7)
check('Six intervals for every character on all seven days',all(len(groups[(c,day)])==6 for c in chars for day in range(7)))
coverage=True
for key,dayrows in groups.items():
    ordered=sorted(dayrows,key=lambda r:r['startMinute'])
    coverage &= ordered[0]['startMinute']==0 and ordered[-1]['endMinute']==1440 and all(a['endMinute']==b['startMinute'] for a,b in zip(ordered,ordered[1:]))
check('Schedule covers each full day without overlap or gap',coverage)
check('Valid schedule references and intervals',all(r['characterId'] in chars and r['locationId'] in all_sites and r['anchorPublicPlaceId'] in places and 0<=r['startMinute']<r['endMinute']<=1440 and r['startMinute']<=r['baselineArrivalMinute']<r['endMinute'] for r in rows))
check('One time convention everywhere',all(r['timezone']=='user_local' and minute(r['startsAt'])==r['startMinute'] and minute(r['endsAt'])==r['endMinute'] for r in rows) and data['world']['clock']['dayOfWeekZero']=='Sunday')
check('Private home schedule access stays private',all(r['availability']=='private' and r['accessGate']=='specific_invitation' for r in rows if r['locationId'] in homes))
check('Public leisure fits visitor hours',all(opened(places[r['locationId']],r['startMinute'],r['endMinute']) for r in rows if r['availability']=='available_if_willing'))
check('Bandit baseline reveals no public hideout access',all(r['locationId'] in (place_num[47]['id'],chars[r['characterId']]['homeId']) and r['accessGate'] in ('crowcut.access_granted','specific_invitation') for r in rows if r['characterId'] in (by_num[46]['id'],by_num[47]['id'])))
check('Crowcut hidden on initial public map',place_num[47]['access']['initiallyDiscoverable'] is False and place_num[47]['access']['requiredState']=='crowcut.access_granted')

check('14 recurring events',len(events)==14)
check('Event references and visitor hours',all(e['locationId'] in places and all(c in chars for c in e['characterIds']) and 0<=e['dayOfWeek']<=6 and opened(places[e['locationId']],minute(e['startsAt']),minute(e['endsAt'])) for e in events.values()))
event_coverage=True
for e in events.values():
    start,end=minute(e['startsAt']),minute(e['endsAt'])
    for cid in e['characterIds']:
        overlaps=[r for r in groups[(cid,e['dayOfWeek'])] if r['startMinute']<end and r['endMinute']>start]
        event_coverage &= all(any(o['eventId']==e['id'] and o['locationId']==e['locationId'] and o['accessGate']==e['accessGate'] for o in r['eventOverrides']) for r in overlaps)
check('Every event participant has matching overlay references',event_coverage)
check('No stray event overlays',all(o['eventId'] in events and r['characterId'] in events[o['eventId']]['characterIds'] and r['dayOfWeek']==events[o['eventId']]['dayOfWeek'] for r in rows for o in r['eventOverrides']))
event_conflicts=[]
for cid in chars:
    for day in range(7):
        es=sorted([e for e in events.values() if cid in e['characterIds'] and e['dayOfWeek']==day],key=lambda e:e['startsAt'])
        for a,b in zip(es,es[1:]):
            if minute(a['endsAt'])>minute(b['startsAt']):event_conflicts.append((cid,day,a['title'],b['title']))
check('No simultaneous fixed events for a participant',not event_conflicts,str(event_conflicts))
check('Event travel is explicitly reserved by runtime contract','inbound/outbound travel' in (ROOT/'CALDERS_RUN_IMPLEMENTATION_HANDOFF.md').read_text() and 'travel' in data['runtimeRules']['eventReservation'])

check('185 world facts',len(facts)==185)
check('Fact references valid',all((f['locationId'] is None or f['locationId'] in locs) and all(c in chars for c in f['knownByCharacterIds']) for f in facts.values()))
check('Private character facts belong only to their owners',all(c['knowledgeSurface']['privateFactId'] in facts and facts[c['knowledgeSurface']['privateFactId']]['knownByCharacterIds']==[c['id']] and facts[c['knowledgeSurface']['privateFactId']]['audience']=='owner_private' for c in chars.values()))
private_crowcut=next(f for f in facts.values() if f['category']=='place_private' and f['locationId']==place_num[47]['id'])
check('Crowcut prior knowledge distinguished between bandits',private_crowcut['knownByCharacterIds']==[by_num[47]['id']] and private_crowcut['partialKnowledge'][0]['characterId']==by_num[46]['id'] and 'does not initially know' in private_crowcut['partialKnowledge'][0]['text'])
check('147 dialogue opportunities, three per character',len(data['dialogueOpportunities'])==147 and Counter(x['characterId'] for x in data['dialogueOpportunities'])=={c:3 for c in chars})
check('Dialogue disclosures and affection are gated',all(x['trigger'] in ('present_and_willing','owner_voluntarily_raises_this_conflict','mutual_interest_and_specific_personal_invitation') for x in data['dialogueOpportunities']))
check('141 beats, three per place',len(data['interactionBeats'])==141 and Counter(x['locationId'] for x in data['interactionBeats'])=={p:3 for p in places})
check('Beat participants and access references valid',all(x['locationId'] in places and all(c in chars for c in x['possibleCharacterIds']) and x['presenceGate'] for x in data['interactionBeats']))
check('14 arcs with three stages and three endings',len(arcs)==14 and all(len(a['stages'])==3 and len(a['endings'])==3 and len(a['clues'])==3 for a in arcs.values()))
check('All companions have a substantial story route',all(c['storyArcIds'] and all(a in arcs and c['id'] in arcs[a]['characterIds'] for a in c['storyArcIds']) for c in chars.values()))
check('Arc participant, location, and clue references valid',all(all(c in chars for c in a['characterIds']) and all(l in places for l in a['locationIds']) and all(cl['holderCharacterId'] in chars and cl['originLocationId'] in places and cl['revealGate'] and cl['automaticLoot'] is False for cl in a['clues']) for a in arcs.values()))
check('Three sequential stages and exclusive ending group',all([s['index'] for s in a['stages']]==[1,2,3] and len({e['exclusiveOutcomeGroup'] for e in a['endings']})==1 and len({e['key'] for e in a['endings']})==3 for a in arcs.values()))
check('20 date blueprints cover all six districts',len(data['dateBlueprints'])==20 and {d['districtId'] for d in data['dateBlueprints']}==set(districts))
check('Date location and character references valid',all(d['locationId'] in places and places[d['locationId']]['parentLocationId']==d['districtId'] and all(c in chars for c in d['characterIds']) for d in data['dateBlueprints']))
check('Seven factions with valid participants and seats',len(data['factions'])==7 and all(f['seatLocationId'] in places and all(c in chars for c in f['associatedCharacterIds']) for f in data['factions']))
check('Travel matrix is symmetric and covers districts',len(data['travel']['ordinaryMinutes'])==6 and all(len(r)==6 for r in data['travel']['ordinaryMinutes']) and all(data['travel']['ordinaryMinutes'][a][b]==data['travel']['ordinaryMinutes'][b][a] for a in range(6) for b in range(6)))
check('No image slot falsely marked ready',all(c['asset']['status']=='not_generated' for c in chars.values()) and all(p['asset']['status']=='not_generated' for p in places.values()) and all(h['asset']['status']=='not_generated' for h in homes.values()) and data['world']['assets']['status']=='not_generated')
check('Adapter requirement stated',data['metadata']['compatibility']['requiresAdapter'] is True and data['metadata']['compatibility']['dropInImport'] is False)
check('Final identity consistently Calder’s Run',data['world']['name']=="Calder's Run" and data['world']['slug']=='calders-run' and not re.search(r"Calder[’']s Switch",PACK.read_text()))
check('No placeholder draft markers',not re.search(r'\b(TODO|TBD|lorem ipsum|INSERT HERE)\b',PACK.read_text(),re.I))
check('Declared counts match actual tables',counts['characters']==len(chars) and counts['locationRecords']==len(locs) and counts['weeklyScheduleRows']==len(rows) and counts['worldFacts']==len(facts) and counts['directedSocialConnections']==len(bonds))

bible=ROOT/'CALDERS_RUN_WORLD_BIBLE.md'
bible_text=bible.read_text(encoding='utf-8')
check('All full profiles and place entries in the bible',all(f'### C{i:02d} ·' in bible_text for i in range(1,50)) and all(f'### P{i:02d} ·' in bible_text for i in range(1,48)))
check('Readable bible has substantial narrative depth',len(bible_text.split())>=40000,f'{len(bible_text.split()):,} whitespace-delimited words including tables and prompts')

files={}
for path in (bible,PACK,ROOT/'CALDERS_RUN_IMPLEMENTATION_HANDOFF.md'):
    raw=path.read_bytes();files[path.name]=dict(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
report=dict(status='passed' if not errors else 'failed',checksPassed=sum(c['passed'] for c in checks),checksTotal=len(checks),errors=errors,counts=counts,
  ageAllocation=dict(ages),genderAllocation=dict(genders),spiceAllocation=dict(spices),minimumSocialDegree=min(degree.values()),bibleWordCount=len(bible_text.split()),
  checks=checks,files=files,
  limitations=['Authoring consistency verified; no production importer or runtime has been executed.','Event overlays specify travel reservation semantics; the production resolver must implement and test that contract.','Images are prompts only and are correctly marked not_generated.','This is fictional worldbuilding; sources inform period texture, not certification of every invented detail.'])
(ROOT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary=f'''# Calder's Run — validation

**Status: {report['status'].upper()} · {report['checksPassed']} / {report['checksTotal']} checks passed.**

The supplied final content pack and readable bible were checked together. The bible contains approximately {report['bibleWordCount']:,} whitespace-delimited words, including tables and image prompts.

| Layer | Verified count |
|---|---:|
| Companions | {len(chars)} |
| Women / men | 32 / 17 |
| Ages 18–22 / 23–50 | 29 / 20 |
| Spice 3 / 2 / 1 | 24 / 15 / 10 |
| Visitable places / districts | 47 / 6 |
| Total district and place records | 53 |
| Private homes | 49 |
| Baseline weekly rows | {len(rows):,} |
| Directed social connections | {len(bonds)} |
| Minimum connections per companion | {min(degree.values())} |
| Facts / dialogue opportunities / interaction beats | 185 / 147 / 141 |
| Arcs / weekly opportunities / date blueprints | 14 / 14 / 20 |

Checks cover exact allocation, place matching, family relationships, reference validity, profile depth, complete weekly intervals, visitor hours, event overlays, private facts, initial hideout access, and honest asset status. Detailed results and checksums are in `validation.json`.

## Practical limits

'''+ '\n'.join('- '+x for x in report['limitations'])+'\n'
if errors:summary+='\n## Findings to resolve\n\n'+'\n'.join('- '+x for x in errors)+'\n'
(ROOT/'CALDERS_RUN_VALIDATION.md').write_text(summary,encoding='utf-8')
print(json.dumps({k:report[k] for k in ('status','checksPassed','checksTotal','errors','bibleWordCount','minimumSocialDegree')},indent=2))
raise SystemExit(1 if errors else 0)
