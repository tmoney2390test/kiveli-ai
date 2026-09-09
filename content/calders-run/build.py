#!/usr/bin/env python3
"""Rebuild Calder's Run authoring deliverables using Python's standard library."""
from pathlib import Path
from collections import Counter, defaultdict
import json, re, runpy, unicodedata, uuid

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'authoring'

def read(name):
    return runpy.run_path(str(SRC / name))

def slug(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',text).strip('-')

def uid(kind, key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f'https://kivelli.app/authoring/calders-run/{kind}/{key}'))

def clock(value):
    return f'{value // 60:02d}:{value % 60:02d}'

def minute(value):
    h,m=map(int,value.split(':'))
    return h*60+m

raw = read('roster.py')
world = read('world.py')
lore = read('locations.py')['LOCATION_LORE']
social = read('social.py')
social['extend_world'](world)
stories = read('stories.py')
profiles = {}
for source in sorted(SRC.glob('characters_*.py')):
    incoming=runpy.run_path(str(source))['PROFILES']
    assert not profiles.keys() & incoming.keys(), 'Duplicate authoring character number'
    profiles.update(incoming)

R = {c[0]:c for c in raw['ROSTER']}
P = {p[0]:p for p in raw['PLACES']}
D = {d[0]:d for d in raw['DISTRICTS']}
CS = {i:slug(r[1]) for i,r in R.items()}
PS = {i:p[3] for i,p in P.items()}
DS = {i:d[2] for i,d in D.items()}
CID = {i:uid('character',key) for i,key in CS.items()}
PID = {i:uid('location',key) for i,key in PS.items()}
DID = {i:uid('location',key) for i,key in DS.items()}
HOME = {i:uid('home',key+'-home') for i,key in CS.items()}
world_id=uid('world','calders-run')
day_names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
spice_label={1:'patient courtship',2:'warm and responsive',3:'confident and forward'}

# Ordinary dry-weather planning estimates, including typical crossing time.
# They are fictional world measurements, not real-world travel claims.
travel = [
 [8,8,10,35,35,55],
 [8,8,12,37,40,58],
 [10,12,8,25,30,50],
 [35,37,25,10,50,75],
 [35,40,30,50,20,85],
 [55,58,50,75,85,20],
]

def owners(place):
    return [i for i,r in R.items() if r[5]==place]

def open_during(place,start,end):
    a,b=minute(P[place][5]),minute(P[place][6])
    if a==0 and b==1440:return True
    if b<=a:return (start>=a and end<=1440) or (start>=0 and end<=b)
    return start>=a and end<=b

locations=[]
districts=[]
for i,name,key in raw['DISTRICTS']:
    dl=world['DISTRICT_LORE'][i]
    district=dict(id=DID[i],authoringNumber=i,worldId=world_id,slug=key,name=name,nodeType='district',parentLocationId=None,**dl)
    district['imagePrompt']=f"Historical Western town, fictional territorial Southwest, 1888. {dl['summary']} Visible details: {', '.join(dl['sensory'])}. {world['WORLD']['visualContext']['hero']} One coherent scene focused on this district; no labels or text."
    locations.append(district)
    districts.append(dict(locationId=DID[i],name=name,slug=key,placeIds=[PID[n] for n,p in P.items() if p[1]==i]))
for i,district,name,key,category,opens,closes in raw['PLACES']:
    ll=lore[i]
    locations.append(dict(
      id=PID[i],authoringNumber=i,worldId=world_id,slug=key,name=name,nodeType='place',parentLocationId=DID[district],category=category,
      publicSummary=ll['summary'],history=ll['history'],layout=ll['layout'],socialTexture=ll['socialTexture'],
      authorOnlyPrivateTruth=ll['privateTruth'],storySeeds=ll['storySeeds'],activities=ll['activities'],visualAnchors=ll['visualAnchors'],etiquette=ll['etiquette'],
      primaryCharacterIds=[CID[c] for c in owners(i)],regularCharacterIds=[CID[c] for c in ll['regulars']],
      visitorHours=dict(opens=opens,closes=closes,overnight=minute(closes)<=minute(opens),timezone='user_local'),
      access=dict(mode='story_gated' if i==47 else 'public_frontage',initiallyDiscoverable=i!=47,requiredState='crowcut.access_granted' if i==47 else None,privateAreasRequireInvitation=True),
      imagePrompt=f"Fictional territorial Southwest, 1888. {name}: {ll['summary']} Show {', '.join(ll['visualAnchors'])}. {ll['layout']} A single coherent, inhabited architectural scene; period materials, natural light, no text or logo.",
      asset=dict(key='calders-run-'+key,status='not_generated')
    ))

home_groups={}
for key,parent,title,cast in raw['HOMES']:
    for i in cast:
        assert i not in home_groups
        home_groups[i]=(key,parent,title)
parent_overrides={27:41,29:43,30:45}
homes=[]
home_parent={}
for i in R:
    group,parent,title=home_groups[i]
    parent=parent_overrides.get(i,parent)
    home_parent[i]=parent
    homes.append(dict(id=HOME[i],worldId=world_id,slug=CS[i]+'-home',ownerCharacterId=CID[i],name=R[i][1]+' — private room',
      householdGroup=group,householdDescription=title,parentPublicPlaceId=PID[parent],districtId=DID[P[parent][1]],
      description=profiles[i]['room'],access='specific_invitation_only',publicMapVisible=False,
      note='A private room belongs to this character. Sharing a household group does not share keys, consent, an appointment, or a romantic relationship.',
      imagePrompt=f"A lived-in private adult room in a fictional Southwest frontier town in 1888. {profiles[i]['room']} Period materials, warm natural or lamplit light, no person, no text. Private papers closed rather than legible.",asset=dict(key='calders-run-'+CS[i]+'-home',status='not_generated')))

bond_data=defaultdict(list)
for i,cp in profiles.items():
    for other,kind,fact in cp['ties']:
        pair=tuple(sorted((i,other)))
        item=dict(type=kind,sharedFact=fact)
        if item not in bond_data[pair]:bond_data[pair].append(item)
for a,b,kind,fact in social['EXTRA_TIES']:
    item=dict(type=kind,sharedFact=fact)
    if item not in bond_data[tuple(sorted((a,b)))]:bond_data[tuple(sorted((a,b)))].append(item)
kin={tuple(sorted((a,b))):relation for a,b,relation in social['KINSHIP']}
connections=[]
for (a,b),facts in sorted(bond_data.items()):
    for subject,other in [(a,b),(b,a)]:
        connections.append(dict(id=uid('connection',CS[subject]+'--'+CS[other]),characterId=CID[subject],otherCharacterId=CID[other],
          relationshipTypes=list(dict.fromkeys(f['type'] for f in facts)),sharedFacts=[f['sharedFact'] for f in facts],
          knowledgeRule='Known to these participants as their own relationship history; do not broadcast it to everyone in town.',
          kinship=kin.get((a,b)),npcRomancePermitted=(a,b) not in kin,
          state='baseline_history',reciprocity='Two directed records share the same authored history; affection, trust, attraction, and new disclosures remain independently tracked.'))

characters=[]
for i,name,age,gender,spice,place,occupation,heritage,pattern in raw['ROSTER']:
    c=profiles[i]
    connected=[x for x in connections if x['characterId']==CID[i]]
    arc_ids=[uid('arc',a['slug']) for a in stories['ARCS'] if i in a['characters']]
    faction_slugs=[f['slug'] for f in world['FACTIONS'] if i in f['members']]
    characters.append(dict(
      id=CID[i],authoringNumber=i,worldId=world_id,slug=CS[i],name=name,age=age,gender=gender,heritage=heritage,spiceLevel=spice,occupation=occupation,
      primaryLocationId=PID[place],districtId=DID[P[place][1]],homeId=HOME[i],ageBand='18-22' if age<=22 else '23-50',
      biography=c['bio'],appearance=c['look'],personalityTraits=c['traits'],interests=c['interests'],quirk=c['quirk'],
      psychology=dict(worldview=c['belief'],innerContradiction=c['tension'],coreInsecurity=c['fear'],desire=c['want'],complication=c['obstacle'],authorOnlyPrivateTruth=c['secret']),
      voice=dict(cadenceAndRegister=c['voice'],openingLine=c['lines'][0],casualLine=c['lines'][1],conflictLine=c['lines'][2],earnedAffectionLine=c['lines'][3],
        rules=['Use this character’s vocabulary and attention, without phonetic accent spelling.','Make room for ordinary humor and interests beyond the main conflict.','Do not substitute the generic world accent for the authored individual voice.']),
      relationship=dict(style=c['romance'],boundaries=c['boundary'],expressionTier=spice_label[spice],playerRoute='Available to an adult player character where mutual attraction is established; no player gender or orientation is presumed.',
        baseline='No current exclusive partnership blocks a player route. Past relationships and family ties retain their authored meaning.',
        progress=['recognition through repeated ordinary contact','mutual interest named or invited','private confidence voluntarily offered','affection and expectations discussed','a continuing relationship that permits independent choices'],
        professionDoesNotImplyConsent=True,kinshipCharacterIds=[CID[b if a==i else a] for a,b,_ in social['KINSHIP'] if i in (a,b)]),
      anecdotes=[dict(id=uid('anecdote',CS[i]+f'-{n+1}'),text=t,revealGate='A relevant topic and this character’s willingness to share; not automatically public biography.') for n,t in enumerate(c['memories'])],
      workActivities=c['tasks'],weeklyLeisureAnchorIds=[PID[x] for x in c['anchors']],schedulePattern=pattern,
      factionAssociations=faction_slugs,factionRule='Association, employment, or participation is not unconditional loyalty or formal membership in every institution.',
      connectionIds=[x['id'] for x in connected],storyArcIds=arc_ids,
      knowledgeSurface=dict(public=[f"Their own occupation at {P[place][2]}.",c['belief'],f"Direct experience of {world['DISTRICT_LORE'][P[place][1]]['rhythm'].lower()}"],
        personalHistory=[x['id'] for x in connected],privateFactId=uid('fact',f'character-{CS[i]}-private'),
        exclusions=['Other characters’ hidden facts, client or patient records, sealed messages, and private rooms remain unknown without a supported disclosure.','A public rumor is attributed to a speaker and is not promoted to fact by repetition.','Remember only events the character witnessed, was told, or can establish from available records.']),
      portraitPrompt=f"Single portrait of {name}, an adult {age}-year-old {gender}, {heritage}, {occupation.lower()}, fictional territorial Southwest, 1888. {c['look']} At the visitor-facing part of {P[place][2]}. Fully clothed, occupation-specific styling, natural posture, one person, no text, no collage. Preserve stated age and distinctive appearance.",
      asset=dict(key='calders-run-'+CS[i],status='not_generated')
    ))

# Facts are authoring records. The importer must apply audience/disclosure
# gates before constructing any player-facing prompt or visible description.
facts=[]
for i,dl in world['DISTRICT_LORE'].items():
    for field in ('history','rhythm','ritual'):
        facts.append(dict(id=uid('fact',DS[i]+'-'+field),category='district',text=dl[field],locationId=DID[i],audience='public_local_knowledge',knownByCharacterIds=[],revealGate=None))
for year,title,body in world['TIMELINE']:
    facts.append(dict(id=uid('fact','history-'+slug(title)),category='history',text=f'{year} — {title}: {body}',locationId=None,audience='public_history_with_stated_uncertainties',knownByCharacterIds=[],revealGate=None))
for i,ll in lore.items():
    facts.append(dict(id=uid('fact',PS[i]+'-public'),category='place',text=ll['summary'],locationId=PID[i],audience='story_gated_local_knowledge' if i==47 else 'public_local_knowledge',knownByCharacterIds=[CID[c] for c in owners(i)],revealGate='crowcut.name_known' if i==47 else None))
    facts.append(dict(id=uid('fact',PS[i]+'-private'),category='place_private',text=ll['privateTruth'],locationId=PID[i],audience='author_only_until_disclosed',knownByCharacterIds=[CID[c] for c in owners(i)],revealGate='Explicit voluntary disclosure or an authored evidence transition; ownership alone does not reveal another person’s knowledge.'))
for i,c in profiles.items():
    facts.append(dict(id=uid('fact',f'character-{CS[i]}-private'),category='character_private',text=c['secret'],locationId=PID[R[i][5]],audience='owner_private',knownByCharacterIds=[CID[i]],revealGate='The owner voluntarily discloses this fact, or an arc explicitly establishes this particular fact through evidence. General trust never unlocks every secret.'))

core_facts=[
 ('year','The baseline year is 1888, in a fictional territorial county in the Southwest.'),
 ('name','Calder’s Run is the route-derived town name; Amelia Calder is a historical founder, not a living companion.'),
 ('population','The town and immediately dependent settlement contain approximately 4,800 residents; only 49 are named companion records.'),
 ('bridge','The bridge is unfinished at launch. Limited construction authority is distinct from the proposed full franchise.'),
 ('crossing','The ferry provides the ordinary baseline river crossing. The railhead lies on the east bank.'),
 ('railway','The Arroyo & Western Railway seeks a 25-year franchise, including bridge, access, and water terms.'),
 ('compact','The fictional 1874 crossing compact contains surviving obligations and disputed priority; it does not erase earlier land and water histories.'),
 ('council','The five-seat local council includes Adelaide’s valley seat and Mabel’s business seat; the remaining offices are background roles.'),
 ('mine','The 1881 Saint Agnes collapse remains a living memory and helped produce the mutual society.'),
 ('factions','Institutional association does not require a character to agree with every member or defend every action.'),
 ('adult-cast','Every companion is 18–50. The schoolhouse social program represented here is an adult after-hours reading circle.'),
 ('public-life','Ordinary work, food, music, friendship, and rest continue between major plot milestones.'),
]
for key,body in core_facts:
    facts.append(dict(id=uid('fact','world-'+key),category='world',text=body,locationId=None,audience='public_world_context',knownByCharacterIds=[],revealGate=None))

# Split the Crowcut truth by actual knowledge instead of granting both bandits
# knowledge of Silas's undisclosed pre-theft decision.
crowcut_private=next(f for f in facts if f['id']==uid('fact',PS[47]+'-private'))
crowcut_private['knownByCharacterIds']=[CID[47]]
crowcut_private['partialKnowledge']=[dict(characterId=CID[46],text='Cole knows he participated in the theft and later discovered that the money included workers’ wages. He does not initially know that Silas knew beforehand.')]

arcs=[]
for a in stories['ARCS']:
    key=a['slug']
    clues=[]
    for ck,title,holder,place,gate in a['clues']:
        clues.append(dict(id=uid('clue',ck),slug=ck,title=title,holderCharacterId=CID[holder],originLocationId=PID[place],revealGate=gate,portable=key=='the-crowcut-reckoning' or ck in ('bess-tour-letter','tour-offer'),automaticLoot=False))
    arcs.append(dict(id=uid('arc',key),slug=key,title=a['title'],characterIds=[CID[i] for i in a['characters']],locationIds=[PID[i] for i in a['places']],openingHook=a['opening'],stakes=a['stakes'],clues=clues,
      stages=[dict(index=n+1,title=t,scene=body,entryState='unstarted' if n==0 else f'{key}.stage_{n}_complete',exitState=f'{key}.stage_{n+1}_complete',
        transitionRule='A saved authored decision records what happened. An LLM suggestion is not the transition itself.') for n,(t,body) in enumerate(a['stages'])],
      endings=[dict(key=e,title=e.replace('-',' ').title(),consequences=body,exclusiveOutcomeGroup=key+'.resolution') for e,body in a['endings']],
      relationshipThread=a['relationshipThread'],declineOption='The player can decline or pause. Characters retain their lives and disagreements; no automatic romance loss or unchosen crime follows.',
      knowledgeRule='Reveal only a clue actually disclosed or established in this saved playthrough. Unchosen endings are authoring alternatives, not simultaneous canon.',
      persistenceRule='Resolution and subsequent schedule/location changes are saved. Resolved clues do not replay as fresh revelations at weekly events.'))

events=[]
for key,title,day,start,end,place,cast,summary,hook,gate in stories['EVENTS']:
    events.append(dict(id=uid('event',key),slug=key,title=title,dayOfWeek=day,dayName=day_names[day],startsAt=start,endsAt=end,locationId=PID[place],characterIds=[CID[i] for i in cast],summary=summary,storyHook=hook,accessGate=gate,
      recurrence='weekly_opportunity_while_relevant',timezone='user_local',replayRule='Social activity may recur; a revealed secret, vote, offer decision, or resolved dispute does not reset.'))

# One rest day per companion; groupings intentionally allow a mixture of work
# and leisure throughout the week. Major events can be a chosen commitment on
# that day, with the rest of the day remaining free.
rest_days = {
 1:1,2:0,3:0,4:5,5:2,6:0,7:3,8:1,9:2,10:1,11:2,12:3,13:0,14:0,15:1,16:2,17:6,
 18:3,19:2,20:0,21:3,22:6,23:1,24:1,25:0,26:0,27:2,28:1,29:3,30:0,31:3,32:0,33:6,34:1,35:2,36:1,
 37:2,38:3,39:0,40:0,41:1,42:2,43:0,44:2,45:3,46:1,47:2,48:1,49:2}

social_activity={
 1:'Take a meal or sit in the public courtyard',2:'Read released notices and discuss the paper at the front counter',
 3:'Read the public notice board and greet acquaintances in the waiting room',4:'Watch ordinary training from the visitor rail and talk with a free friend',
 5:'Browse fabrics and useful objects without committing to a purchase',6:'Share bread and a quiet table after the rush',
 7:'Greet an off-duty acquaintance in the public waiting room',8:'Talk in the safe visitor yard after checking that work permits an interruption',
 9:'Enjoy the public room, music, and conversation',10:'Visit the public sitting room for music and ordinary company',
 11:'Attend a released rehearsal or meet a friend in the foyer',12:'Enjoy an unhurried meal at the public counter',
 13:'Enjoy music, conversation, and a dance if mutually invited',14:'Take tea in the public sitting area',15:'Watch public card play or discuss music with a free acquaintance',
 16:'Join the salon’s public-facing sitting area when the host is receiving social visitors',17:'Watch the ordinary crossing from the public waiting area',
 18:'Leave an ordinary delivery and talk briefly in the public courtyard if the staff have time',19:'Exchange neighborhood news in the public waiting area',
 20:'Join the common room by the house’s ordinary visiting arrangement',21:'Browse the market and greet familiar sellers',22:'Enjoy the public yard, music, or quiet reading',
 23:'Talk beside the safe visitor rail about a drawing or ordinary river life',24:'Browse public household supplies and greet a free acquaintance',
 25:'Watch an arrival from the public platform',26:'Read released public notices and talk with a friend on a covered break',
 27:'Visit the designated camp reception area by its ordinary visitor arrangement',28:'View the works from the public overlook',29:'Wait in the public reception area for an agreed social conversation',
 30:'View released photographs in the shopfront',31:'Take a meal or talk on the provisioner’s public porch',32:'Visit the public ranch yard and wait for an invited host',
 33:'Visit the schoolhouse yard; enter a class only during the scheduled adult session',34:'Share shade and river conversation under suitable conditions',
 35:'Meet neighbors in the meeting-house yard',36:'Browse the public dairy counter and discuss food',37:'View the public nursery display',38:'Watch the public sale yard from the visitor area',
 39:'Visit the public mutual-society reception area, away from mine workings',40:'View permitted specimens in the public office',41:'Take a meal in the coach station waiting area',
 42:'Browse the trading room and join public conversation',43:'Wait at the claim’s designated visitor point for an invited host',44:'Walk the public path and respect any service in progress',
 45:'Share ordinary news in the relay’s public receiving area',46:'Enjoy music or conversation in the Red Sash public parlor',47:'Attend a specifically invited communal meeting',
}

def choose_leisure(i,day,start,end):
    candidates=profiles[i]['anchors'][:]
    candidates=candidates[day%len(candidates):]+candidates[:day%len(candidates)]
    district=P[R[i][5]][1]
    candidates += [n for n,p in P.items() if p[1]==district and n!=47]
    for n in candidates:
        if n!=47 and open_during(n,start,end):return n
    return 1

def baseline_row(i,day,slot,start,end,kind,place=None):
    c=profiles[i]
    if kind=='home':
        lid=HOME[i]
        if start==0:activity='Sleep and rest in a private room.'
        elif start<720:activity='Breakfast, personal correspondence, and preparation for the day.'
        elif start>=1140:activity='Unwind, enjoy private time, and settle for the night.'
        else:activity=f"Personal time for {c['interests'][day%5]}, an ordinary meal, or an individually agreed visit."
        mode='private'; gate='specific_invitation'; parent=home_parent[i]
    elif kind=='work':
        place=place or R[i][5];lid=PID[place];parent=place
        activity=c['tasks'][(day+slot)%6].capitalize()+'.'
        mode='story_gated' if i in (46,47) else 'working'
        gate='crowcut.access_granted' if i in (46,47) else 'visitor_frontage_only'
    else:
        place=place or choose_leisure(i,day,start,end);lid=PID[place];parent=place
        activity=f"{social_activity[place]}; conversation may turn to {c['interests'][day%5]}."
        mode='available_if_willing';gate='public_frontage'
    return dict(id=uid('schedule',f'{CS[i]}-{day}-{slot}'),characterId=CID[i],dayOfWeek=day,dayName=day_names[day],slotIndex=slot,startMinute=start,endMinute=end,startsAt=clock(start),endsAt=clock(end),
      locationId=lid,anchorPublicPlaceId=PID[parent],activity=activity,availability=mode,accessGate=gate,timezone='user_local',eventOverrides=[])

schedules=[]
for i in R:
    pattern=R[i][8]
    for day in range(7):
        off=day==rest_days[i]
        if pattern=='evening':
            blocks=[(0,480,'home'),(480,720,'home'),(720,960,'leisure'),(960,1080,'leisure' if off else 'work'),(1080,1260,'home' if off else 'work'),(1260,1440,'home' if off else 'work')]
        else:
            blocks=[(0,360,'home'),(360,540,'work' if pattern=='early' and not off else 'home'),(540,780,'leisure' if off else 'work'),(780,1020,'leisure' if off or pattern=='early' else 'work'),(1020,1140,'home' if i in (46,47) else 'leisure'),(1140,1440,'home')]
        for slot,(start,end,kind) in enumerate(blocks):
            # The initial hideout is private; off-duty bandits remain there
            # until a particular authored meeting or transition relocates them.
            if i in (46,47) and kind=='leisure':kind='home'
            schedules.append(baseline_row(i,day,slot,start,end,kind))

by_character_day=defaultdict(list)
for row in schedules:by_character_day[(row['characterId'],row['dayOfWeek'])].append(row)
for event in events:
    start,end=minute(event['startsAt']),minute(event['endsAt'])
    for cid in event['characterIds']:
        for row in by_character_day[(cid,event['dayOfWeek'])]:
            if row['startMinute']<end and row['endMinute']>start:
                row['eventOverrides'].append(dict(eventId=event['id'],locationId=event['locationId'],startsAt=event['startsAt'],endsAt=event['endsAt'],accessGate=event['accessGate'],
                  activity=event['summary'],effect='Reserve attendance and travel before applying a social invitation. If the event gate is unmet, use the baseline row.'))

id_to_district={PID[i]:P[i][1] for i in P}
id_to_district.update({HOME[i]:P[home_parent[i]][1] for i in R})
for (cid,day),rows in by_character_day.items():
    for n,row in enumerate(rows):
        previous=rows[n-1] if n else by_character_day[(cid,(day-1)%7)][-1]
        a,b=id_to_district[previous['locationId']],id_to_district[row['locationId']]
        buffer=0 if previous['locationId']==row['locationId'] else travel[a-1][b-1]
        row['baselineArrivalMinute']=row['startMinute']+buffer
        row['travelFromPreviousMinutes']=buffer
        row['travelRule']='During this leading travel interval the character is in transit, not already available at the destination. Weather or plot closures require a saved alternative.'

dialogue=[]
for i,c in profiles.items():
    for n,(kind,gate,topic,textline) in enumerate([
      ('ordinary-company','present_and_willing',c['interests'][0],c['lines'][1]),
      ('personal-conflict','owner_voluntarily_raises_this_conflict',c['tension'],c['lines'][2]),
      ('earned-affection','mutual_interest_and_specific_personal_invitation',c['romance'],c['lines'][3]),
    ]):
        dialogue.append(dict(id=uid('dialogue',CS[i]+f'-{n+1}'),characterId=CID[i],category=kind,topic=topic,exampleLine=textline,
          trigger=gate,locationId=PID[R[i][5]],locationRule='The primary place is a suggested anchor, not a teleport or a claim the character is always on duty.',
          followupMaterial=c['memories'][n%2],followupGate='Share the anecdote only when relevant and voluntarily offered.',
          persistence='Remember the player’s response and any actual disclosure; do not repeat the line as a scripted reset.'))

beats=[]
for i,ll in lore.items():
    for n,(kind,hook) in enumerate([('ordinary-life',ll['socialTexture']),('story-seed',ll['storySeeds'][0]),('story-seed',ll['storySeeds'][1])]):
        beats.append(dict(id=uid('beat',PS[i]+f'-{n+1}'),locationId=PID[i],category=kind,opening=hook,possibleCharacterIds=[CID[c] for c in ll['regulars']],
          presenceGate='Use only characters actually present under the saved schedule or an explicit event override.',
          accessGate='crowcut.access_granted' if i==47 else 'visitor_frontage_or_specific_invitation',
          playerChoices=['Join or ask a relevant question.','Offer a specific ordinary contribution and let the character decide.','Observe without assuming private knowledge.','Decline and continue the day.'],
          context=ll['etiquette'],worldStateRule='A seed invites an authored scene; it does not automatically reveal the location’s private truth or resolve an arc.'))

dates=[]
for key,district,place,title,scene,time,terms in stories['DATES']:
    dates.append(dict(id=uid('date',key),slug=key,title=title,districtId=DID[district],locationId=PID[place],scene=scene,suggestedTime=time,
      conditions=terms,characterIds=[CID[48]] if key=='bess-off-duty' else [CID[49]] if key=='sabines-own-evening' else [],
      eligibility='Mutual interest or a clearly agreed friendly outing; an accepted invitation, free time, access, weather, and travel must support this specific occasion.',
      effect='An accepted date creates a saved temporary schedule override for its participants. Declining does not create the date or move anyone.'))

factions=[]
for f in world['FACTIONS']:
    factions.append({**{k:v for k,v in f.items() if k not in ('seat','members')},'id':uid('faction',f['slug']),'seatLocationId':PID[f['seat']],'associatedCharacterIds':[CID[i] for i in f['members']]})

world_meta={**world['WORLD'],'id':world_id}
world_meta['scopeHistory']='Original core: 45 characters, 30 women, 45 matched places. Four requested additions produce 49 characters (32 women, 17 men), 47 visitable places (46 with public frontage plus one gated hideout), and 6 district nodes. The two added women are unrelated brothel workers.'
world_meta['counts']=dict(characters=len(characters),women=32,men=17,publicFrontagePlaces=46,storyGatedPlaces=1,visitablePlaces=47,districts=6,locationRecords=len(locations),privateHomes=len(homes),weeklyScheduleRows=len(schedules),directedSocialConnections=len(connections),uniqueSocialPairs=len(bond_data),worldFacts=len(facts),dialogueOpportunities=len(dialogue),interactionBeats=len(beats),storyArcs=len(arcs),recurringEvents=len(events),dateBlueprints=len(dates),factions=len(factions))

pack=dict(schemaVersion='calders-run-authoring-pack-v1',
 metadata=dict(title="Calder's Run — World Bible and Authoring Pack",status='complete_authoring_draft',language='en',createdFor='Kivelli',
   identityRule='UUIDv5 authoring identities derived from kind and stable slug. These are not reserved production IDs; the importer must preflight collisions and map to the target schema.',
   compatibility=dict(requiresAdapter=True,dropInImport=False,benchmark='Original Vharadren bible and current repository generator',
     notes=['The Vharadren generator has world-specific identity, roster, and age assumptions. Do not run it against this pack unchanged.','This pack does not fabricate sexual-anatomy fields or claim images have been generated. Any required target fields need an explicit adapter decision.','Author-only records and alternative endings must be filtered before runtime retrieval.']),
   scopeChange='45 core companions plus two male bandits and two unrelated female brothel workers. Two added places each host two new companions.'),
 world=world_meta,chapters=[dict(title=t,body=b) for t,b in world['CHAPTERS']],timeline=[dict(year=y,title=t,body=b) for y,t,b in world['TIMELINE']],
 districts=districts,locations=locations,homes=homes,characters=characters,factions=factions,weeklySchedules=schedules,weeklyRestDays=[dict(characterId=CID[i],dayOfWeek=d,dayName=day_names[d]) for i,d in rest_days.items()],
 recurringEvents=events,socialConnections=connections,worldFacts=facts,dialogueOpportunities=dialogue,interactionBeats=beats,storyArcs=arcs,dateBlueprints=dates,
 travel=dict(districtOrder=[DS[i] for i in D],ordinaryMinutes=travel,assumptions='Fictional dry-weather planning estimates: walking in the core, ordinary hired or owned transport for outlying trips; ferry time included where needed. Actual travel requires a suitable mode and access.',
   constraints=['The unfinished bridge is not a baseline crossing.','A ferry closure invalidates affected trips and requires a saved alternative or cancellation.','A schedule interval contains a leading travel period; presence begins after arrival.','Crowcut route details are not on the public map and require authored discovery.']),
 runtimeRules=dict(
   statePriority=['saved consequential story transition','accepted appointment or date with explicit access','active recurring-event reservation with its travel legs','baseline weekly schedule'],
   eventReservation='When activated, an event reserves its stated hour plus travel from the prior effective place and onward to the next effective place. Split or replace the affected baseline time interval in runtime; do not discard it without checking conflicts. The authoring pack keeps six baseline rows per day and separate event overlays.',
   knowledge='Apply world, location, participant, disclosure, and saved-story gates before assembling prompts. Private truths, private rooms, unknown hideout routes, and unchosen endings are authoring data, not public narration.',
   relationship='Mutual interest, a specific invitation, private access, and consent are separately tracked. Occupation, money, spice tier, and civic help cannot substitute for them.',
   narrator='Describe available evidence and the current saved situation. Preserve uncertainty, independent character choices, and the player’s unspecified identity.',
   progression='A weekly schedule is recurring infrastructure, not a plot reset. Resolve arcs only through authored state transitions.',
   assets='All asset slots are not_generated. Prompts are provided; production media readiness is not claimed.'),
 sourceNotes=world['SOURCES'])

def txt(value):
    return str(value).replace('|','\\|').replace('\n',' ')

def para(label,value):
    return f'**{label}:** {value}\n'

def bullets(items):
    return '\n'.join('- '+str(x) for x in items)+'\n'

names={CID[i]:R[i][1] for i in R}
place_names={PID[i]:P[i][2] for i in P}
place_names.update({DID[i]:D[i][1] for i in D})
place_names.update({HOME[i]:R[i][1]+' — private room' for i in R})
arc_names={a['id']:a['title'] for a in arcs}

def build_bible():
    out=["# Calder's Run\n",'## World bible · complete authoring edition\n',
      '*The river made the town. The railroad wants to own it.*\n',
      'A historically inspired frontier world for Kivelli, set in a fictional territorial Southwest town in 1888. This edition expands the requested 45-person core with two male bandits and two unrelated female brothel workers.\n',
      'The main bible, structured content pack, and reproducible source describe the same canon. Private truths and alternative story endings below are authoring material.\n',
      '## Contents\n',bullets(['[Scope and launch identity](#scope-and-launch-identity)','[World foundations](#world-foundations)','[Districts and travel](#districts-and-travel)','[Factions](#factions)','[Places](#places)','[Character directory](#character-directory)','[Character bible](#character-bible)','[Weekly events](#weekly-events)','[Story arcs](#story-arcs)','[Dates and quieter scenes](#dates-and-quieter-scenes)','[Retrieval and implementation](#retrieval-and-implementation)','[Sources and benchmark](#sources-and-benchmark)']),
      '## Scope and launch identity\n',
      '| Layer | Final scope |\n|---|---|\n'+ '\n'.join(f'| {a} | {b} |' for a,b in [
       ('Companions','49: 32 women and 17 men'),('Age 18–22','29: 21 women and 8 men'),('Age 23–50','20: 11 women and 9 men'),
       ('Spice 3 / 2 / 1','24 / 15 / 10, or 48.98% / 30.61% / 20.41%'),('Visitable places','47: 46 with public frontage and one story-gated bandit hideout'),('Districts and total location records','6 districts; 53 total district/place records'),
       ('Private homes','49 separate character rooms, outside the 53 district/place records'),('Baseline weekly schedule','2,058 rows: 49 characters × 7 days × 6 intervals'),('Social history',f'{len(connections)} directed connections across {len(bond_data)} unique pairs'),('Story and social scenes','14 multi-stage arcs, 14 weekly opportunities, 20 date blueprints'),
       ('Retrieval layers',f'{len(facts)} world facts, 147 dialogue opportunities, 141 place interaction beats'),('Art','World, district, place, portrait, and private-room prompts; images not generated')])+'\n',
      'The requested 50/30/20 spice target cannot be exact with 49 people. Largest-remainder rounding of 24.5/14.7/9.8 gives 24/15/10. These tiers describe romantic expression, not guaranteed availability or consent.\n',
      *[para('Spice '+k,v) for k,v in world_meta['spiceDefinition'].items()],
      para('Core promise',world_meta['relationshipFantasy']),para('Central question',world_meta['centralQuestion']),para('Era',world_meta['era']),para('Geography',world_meta['geography']),
      para('Visual identity',world_meta['visualContext']['hero']),para('Palette',', '.join(world_meta['visualContext']['palette'])),
      'The launch gap this world fills is a grounded historical Western: transport on horseback, a town small enough for reputation to travel, practical work, public loyalties, private desire, and change arriving by rail. It joins the existing worlds as a distinct social and visual setting.\n',
      '## World foundations\n']
    for title,body in world['CHAPTERS']:out += [f'### {title}\n',body+'\n']
    out += ['### Timeline\n','| When | Turning point | Consequence |\n|---|---|---|\n'+'\n'.join(f'| {txt(y)} | {txt(t)} | {txt(b)} |' for y,t,b in world['TIMELINE'])+'\n',
      '## Districts and travel\n']
    for i,name,key in raw['DISTRICTS']:
        dl=world['DISTRICT_LORE'][i]
        out += [f'### {name}\n',dl['summary']+'\n',para('History',dl['history']),para('Sensory anchors',', '.join(dl['sensory'])),para('Daily rhythm',dl['rhythm']),para('Social fault line',dl['fault']),para('Local ritual',dl['ritual']),para('Weather',dl['weather']),para('Story pressure',dl['story']),para('Places',', '.join(P[n][2] for n,p in P.items() if p[1]==i))]
    out += ['### Travel planning\n',pack['travel']['assumptions']+'\n',
      '| From / to | Main Street | Lantern Row | River Ward | Railhead | Valley | Bluffs |\n|---|---:|---:|---:|---:|---:|---:|\n'+'\n'.join('| '+D[i][1]+' | '+' | '.join(str(x) for x in travel[i-1])+' |' for i in D)+'\n',bullets(pack['travel']['constraints']),
      'The diagonal is a typical move between two distinct places within a district. Staying at the same place takes no travel time. Distances are authored planning assumptions; a date or scene must still allow the particular character to make the journey.\n',
      '## Factions\n']
    for f in factions:
        out += [f"### {f['name']}\n",para('Seat',place_names[f['seatLocationId']]),para('Associated characters',', '.join(names[c] for c in f['associatedCharacterIds']))]
        for key,label in [('publicAim','Public aim'),('resources','Resources'),('fracture','Internal disagreement'),('privatePressure','Private pressure'),('offer','What involvement offers'),('cost','What it can cost')]:out.append(para(label,f[key]))
    out += ['## Places\n','Every member of the original 45-person core has a distinct primary place. The Red Sash adds two workers at one brothel; Crowcut Hollow adds two bandits at one hideout. Regulars are social connections, not guaranteed simultaneous occupants.\n',
      '| # | Place | District | Primary companions | Visitor hours |\n|---:|---|---|---|---|\n'+'\n'.join(f'| {i:02d} | {txt(p[2])} | {D[p[1]][1]} | {txt(", ".join(R[c][1] for c in owners(i)))} | {p[5]}–{p[6]}'+(' · gated' if i==47 else '')+' |' for i,p in P.items())+'\n']
    for i in P:
        p=P[i];ll=lore[i]
        out += [f'### P{i:02d} · {p[2]}\n',para('District / category',D[p[1]][1]+' / '+p[4]),para('Primary companions',', '.join(R[c][1] for c in owners(i))),para('Regulars',', '.join(R[c][1] for c in ll['regulars'])),para('Hours',p[5]+'–'+p[6]+'; private areas and named staff availability are separate.'),ll['summary']+'\n',para('History',ll['history']),para('Layout',ll['layout']),para('Social texture',ll['socialTexture']),para('Author-only private truth',ll['privateTruth']),para('Activities',', '.join(ll['activities'])),para('Visual anchors',', '.join(ll['visualAnchors'])),para('House etiquette',ll['etiquette']),'**Story seeds:**\n',bullets(ll['storySeeds'])]
    out += ['## Character directory\n','| # | Character | Age | Gender | Spice | Occupation | Primary place |\n|---:|---|---:|---|---:|---|---|\n'+'\n'.join(f'| {i:02d} | {txt(r[1])} | {r[2]} | {r[3]} | {r[4]} | {txt(r[6])} | {txt(P[r[5]][2])} |' for i,r in R.items())+'\n',
      'Family relationships remain familial: Lucía and Inés are aunt and adult niece; Adelaide and Hazel are mother and adult daughter; Clara and Daniel are adult siblings; Samuel and Caleb are father and adult son; Jonah and Beatrice are uncle and adult niece. Bess and Sabine are unrelated.\n',
      '## Character bible\n','The opening, everyday line, conflict line, and earned-affection line demonstrate distinct conversational states. They are examples, not a four-line script to repeat. Anecdotes and private truths require an appropriate voluntary disclosure.\n']
    for c in characters:
        i=c['authoringNumber'];pr=profiles[i];r=R[i]
        out += [f"### C{i:02d} · {c['name']}\n",f"**{c['age']} · {c['gender']} · spice {c['spiceLevel']} · {c['heritage']}**\n",para('Occupation / primary place',c['occupation']+' / '+place_names[c['primaryLocationId']]),c['biography']+'\n',para('Appearance',c['appearance']),para('Traits',', '.join(c['personalityTraits'])),para('Interests',', '.join(c['interests'])),para('Quirk',c['quirk'])]
        for field,label in [('worldview','Worldview'),('innerContradiction','Contradiction'),('coreInsecurity','Core insecurity'),('desire','What they want'),('complication','What stands in the way'),('authorOnlyPrivateTruth','Author-only private truth')]:out.append(para(label,c['psychology'][field]))
        out += [para('Voice',pr['voice']),'**Voice examples:**\n',bullets([f'{label}: “{line}”' for label,line in zip(['Opening','Everyday company','Conflict','Earned affection'],pr['lines'])]),para('Romance',pr['romance']),para('Boundaries',pr['boundary']),'**Personal anecdotes:**\n',bullets(pr['memories']),para('Private room',pr['room']),para('Work activities','; '.join(pr['tasks'])),para('Rest day',day_names[rest_days[i]]),para('Leisure anchors',', '.join(P[n][2] for n in pr['anchors'])),para('Story arcs','; '.join(arc_names[a] for a in c['storyArcIds'])),'**Social history:**\n']
        for edge in connections:
            if edge['characterId']==c['id']:
                out.append('- **'+names[edge['otherCharacterId']]+':** '+' '.join(edge['sharedFacts'])+'\n')
        out += ['\n**Baseline week:** the six intervals below cover a complete day. Travel occupies the start of an interval when the place changes; private time is not an open invitation. Event reservations follow the table.\n',
          '| Day | Six baseline intervals |\n|---|---|\n']
        for day in range(7):
            cells=[]
            for row in by_character_day[(c['id'],day)]:
                location='Private room' if row['locationId']==HOME[i] else place_names[row['locationId']]
                cells.append(row['startsAt']+'–'+row['endsAt']+' '+location+(' (work)' if row['availability']=='working' else ''))
            out.append('| '+day_names[day]+' | '+txt('; '.join(cells))+' |\n')
        these=[e for e in events if c['id'] in e['characterIds']]
        out += ['\n'+para('Event reservations','; '.join(f"{e['dayName']} {e['startsAt']}–{e['endsAt']}: {e['title']} at {place_names[e['locationId']]} ({e['accessGate']})" for e in these) if these else 'No fixed group event; individually accepted invitations can override the baseline week.'),para('Portrait prompt',c['portraitPrompt'])]
    out += ['## Weekly events\n','These are recurring opportunities with saved one-time revelations. When an event is active, its explicit reservation and travel replace the relevant portion of a baseline interval. If its gate is unmet, the baseline remains in force.\n']
    for e in events:
        out += [f"### {e['title']}\n",para('When / where',e['dayName']+' '+e['startsAt']+'–'+e['endsAt']+' / '+place_names[e['locationId']]),para('Participants',', '.join(names[c] for c in e['characterIds'])),e['summary']+'\n',para('Story opening',e['storyHook']),para('Access',e['accessGate'])]
    out += ['## Story arcs\n','Each arc has three stages and three alternative resolutions. The endings are mutually exclusive outcomes at this level, not facts that all happen. The player can pause or decline; ordinary life continues.\n']
    for a in arcs:
        out += [f"### {a['title']}\n",para('Cast',', '.join(names[c] for c in a['characterIds'])),para('Places',', '.join(place_names[l] for l in a['locationIds'])),para('Opening',a['openingHook']),para('Stakes',a['stakes']),'**Evidence and disclosures:**\n']
        for cl in a['clues']:out.append('- **'+cl['title']+'** — '+names[cl['holderCharacterId']]+'; '+cl['revealGate']+'\n')
        out.append('\n**Stages:**\n')
        for st in a['stages']:out.append(f"{st['index']}. **{st['title']}.** {st['scene']}\n")
        out.append('\n**Alternative resolutions:**\n')
        for en in a['endings']:out.append('- **'+en['title']+'.** '+en['consequences']+'\n')
        out += ['\n'+para('Relationship thread',a['relationshipThread']),para('Pause or decline',a['declineOption'])]
    out += ['## Dates and quieter scenes\n','These blueprints can support a clearly friendly outing or a mutual romantic invitation. The final two are specifically authored for the new Red Sash companions. They do not move characters until a particular invitation is accepted and scheduled.\n']
    for d in dates:
        out += [f"### {d['title']}\n",para('Place / suggested time',place_names[d['locationId']]+' / '+d['suggestedTime']),d['scene']+'\n',para('Conditions',d['conditions'])]
    out += ['## Retrieval and implementation\n',
      'The accompanying JSON contains the full biographies, social records, 2,058 activity-level baseline schedule rows, private homes, 185 knowledge facts, 147 dialogue opportunities, 141 location beats, events, arcs, and dates. The schedules shown above are a compact readable view; the JSON preserves activities, arrival buffers, access, and event overlay references.\n',
      '### Canon and knowledge\n',pack['runtimeRules']['knowledge']+'\n',pack['runtimeRules']['progression']+'\n',
      'Crowcut’s compound secret is deliberately split: Silas initially knows he concealed the payroll’s nature before the theft. Cole initially knows his own participation and later discovery, not Silas’s prior knowledge. A location’s private author note must not be inserted into every present character’s prompt.\n',
      '### Scheduling\n',pack['runtimeRules']['eventReservation']+'\n',
      'Priority: '+ ' → '.join(pack['runtimeRules']['statePriority'])+'.\n',
      'The user-local week begins with Sunday at index 0. The diegetic year stays 1888. A character’s rest day can include a chosen group commitment; service may continue through unnamed adult staff or a reduced appointment book.\n',
      '### Integration status\n','This is a complete, validated authoring pack. It requires an adapter to the current application schema, production identity checks, and an asset-generation pass before launch. It has not been imported or deployed. No media slot is marked ready.\n',
      'The original Vharadren benchmark contained 45 characters, 45 places, six districts, 1,890 schedule rows, 246 directed social connections, 123 facts, 135 dialogue opportunities, 135 location beats, 12 arcs, and 10 events. Calder’s Run matches that layered approach and expands its counts for the four requested additions. Its personalities, disputes, geography, and voices are original to this frontier setting.\n',
      '## Sources and benchmark\n','This world is fiction. The historical references informed limited regional texture; they do not certify the fictional county, institutions, prices, business arrangements, or every career as a documented 1888 example.\n']
    for s in world['SOURCES']:
        label=s['label'] if s['url'].startswith('library:') else '['+s['label']+']('+s['url']+')'
        out.append('- **'+label+'** — '+s['use']+'\n')
    return '\n'.join(out)

def write_handoff():
    counts=world_meta['counts']
    return f'''# Calder's Run — implementation handoff

The authoring pack expands the commissioned frontier world to 49 companions and 47 visitable places. Preserve this content and build an adapter to the current repository schema. The pack is a source of canon, not an already deployed migration.

## Scope that must survive import

- World name: **Calder's Run**; slug: `calders-run`; diegetic year: **1888**.
- **49 companions: 32 women, 17 men.** The original 45-person core remains; C46/C47 are male bandits, C48/C49 are unrelated female brothel workers.
- **29 aged 18–22; 20 aged 23–50.** All are adults. Do not copy Vharadren-specific minimum-age assertions.
- **Spice 3/2/1 = 24/15/10**, rounded from 50/30/20 for 49 people.
- **47 visitable places**, including **The Red Sash** (P46) and **Crowcut Hollow** (P47), plus **6 district nodes** = **53 location records**.
- C01–C45 each have a distinct primary place. C46/C47 share P47; C48/C49 share P46.
- **49 private home records**, with owner-specific access. They are not public place count inflation.
- **2,058 baseline schedule rows; {counts['directedSocialConnections']} directed bonds; {counts['worldFacts']} facts; 147 dialogue opportunities; 141 interaction beats; 14 arcs; 14 events; 20 date blueprints; 7 factions.**

## Files

- `CALDERS_RUN_WORLD_BIBLE.md`: readable complete canon, profiles, places, weekly tables, arcs, and creative direction.
- `calders_run_content_pack.json`: normalized authoring data with stable authoring UUIDs and explicit references.
- `authoring/`: hand-authored biographies, places, world, social facts, stories, and roster.
- `build.py`: deterministic standard-library build of the bible, JSON, and this handoff.
- `validate.py`: count, reference, access, schedule, disclosure, and coverage validation.
- `CALDERS_RUN_VALIDATION.md` and `validation.json`: results from the supplied final files.

## Repository adaptation

The benchmark was the original Vharadren bible and the current world-specific generator in `tmoney2390test/kiveli-ai`. Do not assume that generator is a generic importer. Inspect the actual target branch and its schema before integration. In particular, check required character fields, IDs, age bounds, gender encoding, spice meaning, location kinds, private-home handling, schedule columns, knowledge gates, and media fields.

`schemaVersion` is `calders-run-authoring-pack-v1`. `metadata.compatibility.requiresAdapter` is true. UUIDv5 values are deterministic authoring identities based on entity kind and slug, not pre-reserved production IDs. Keep a mapping if production IDs differ. Preflight collisions, use a transaction or staged import where supported, and make repeat imports idempotent.

Map narrative fields without replacing specific prose with generic templates. The source does not invent sexual-anatomy fields to satisfy an unrelated generator. If the target requires additional fields, resolve their treatment explicitly in the adapter rather than silently fabricating canon.

## Retrieval and private knowledge

Do not send this entire authoring pack to a player-facing model. Filter by saved world, location access, actual participant, disclosure state, and chosen story outcome. Author-only private truths, closed records, unchosen endings, and undiscovered hideout details must remain outside public prompts. Ordinary public facts can be retrieved locally without granting access to all social history.

The Crowcut location truth is compound. Silas knows his own pre-theft decision; Cole initially knows his participation and later discovery only. The fact record contains an explicit partial-knowledge entry. Do not infer that every resident knows every private location fact.

Kinship edges are fixed family history and are excluded from NPC romance. Bess and Sabine are unrelated. Occupational attention and paid appointments do not establish personal attraction or change a character's work by implication.

## Time and transitions

Baseline: seven days, six contiguous intervals per day, minutes 0–1440, Sunday index 0, user-local simulation clock. `baselineArrivalMinute` reserves the leading travel time when locations change. The character is in transit before that point.

Recurring events are explicit overlays, with exact hours and participants. An activated event reserves its scene and inbound/outbound travel, splitting or replacing affected baseline minutes. Reserve travel before accepting a conflicting appointment. A failed gate preserves the baseline; a private invitation is not inferred from a public venue being open. Event attendance does not make an employer's business close automatically.

Use this priority: saved consequential story transition → accepted appointment/date → active recurring event with travel → baseline. Test the actual runtime resolver on a cross-river trip, overlapping event interval, private home visit, and unmet Crowcut gate. The supplied validator checks authoring consistency; it does not claim to have tested an unimplemented production adapter.

The bridge is unfinished at launch and cannot serve as a default crossing. A ferry closure or severe weather requires a canceled or saved alternative journey. Arc resolutions update affected facts, access, employment, and schedules as one coherent transition. A tour, surrender, departure, relocation, or house purchase does not happen merely because the narrator mentions it.

## Art and release

All image slots are `not_generated`. The pack includes a world hero brief, six district prompts, 47 place prompts, 49 clothed adult portrait prompts, and 49 private-room prompts. Generate and inspect them against individual ages, appearance, work, and period design before declaring media readiness.

This delivery creates the world bible and authoring content. It does not modify the repository, import a database, or publish the world. Run the adapter's own real checks and release process when implementation is requested.

## Rebuild and verify

From this directory, run `python build.py` and then `python validate.py`. The package uses only Python's standard library. The generated artifacts and source ship together so later content changes can be regenerated and checked.
'''

if __name__=='__main__':
    (ROOT/'calders_run_content_pack.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'CALDERS_RUN_WORLD_BIBLE.md').write_text(build_bible(),encoding='utf-8')
    (ROOT/'CALDERS_RUN_IMPLEMENTATION_HANDOFF.md').write_text(write_handoff(),encoding='utf-8')
    print(json.dumps(world_meta['counts'],indent=2))
