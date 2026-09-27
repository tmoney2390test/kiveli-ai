// Authored profession rosters. Public hours are respected; private interests happen at home.
const rosterGroups = [
  {slugs:['dr-lena-okafor','amaya-flores','zoe-mercer'],start:420,end:900,off:[2,6]},
  {slugs:['mara-venn','milo-jensen','micah-torres'],start:360,end:840,off:[0,3]},
  {slugs:['imani-laurent','elian-park','liora-haddad','hana-petrov','ari-mendoza'],start:420,end:900,off:[1,5]},
  {slugs:['sora-bell','malik-orison'],start:600,end:1080,off:[1,4]},
  {slugs:['commander-rhea-navarro','kellan-ro','mina-zhao','zahra-benali','yara-kwon'],start:480,end:960,off:[0,2]},
  {slugs:['owen-calder','leona-baptiste'],start:540,end:1020,off:[2,4]},
  {slugs:['dax-holloway','nia-calder','freya-solberg','luc-moreau','poppy-reyes','noah-adeyemi'],start:480,end:960,off:[0,6]},
  {slugs:['dr-selene-ward','priya-nwosu','theo-vance','iris-vale','noura-castillo','elias-thorne','kenji-brooks'],start:840,end:1320,off:[1,4]},
  {slugs:['vesper-quinn','camille-arden','rafael-costa','mae-lin','aya-nakamura'],start:1080,end:1440,off:[1,2]},
  {slugs:['talia-reyes','eden-baptiste'],start:660,end:1140,off:[0,2]},
];
const fallback={start:540,end:1020,off:[0,6]};
const minutes=time=>{const [h,m]=time.split(':').map(Number);return h*60+m;};
export function openIntervals(location){
  if(!location?.hours)return [[0,1440]];
  const start=minutes(location.hours.open),end=minutes(location.hours.close);
  return end>start?[[start,end]]:[[0,end],[start,1440]];
}

export function buildEnrichedSchedules(characters,locations){
  const rows=[];
  const bySlug=new Map(locations.map(place=>[place.slug,place]));
  for(const character of characters){
    const roster=rosterGroups.find(group=>group.slugs.includes(character.slug))??fallback;
    const late=roster.start>=840;
    for(let day=0;day<7;day++){
      const off=roster.off.includes(day);
      const add=(start,end,slug,activity,availability,kind)=>{
        if(end<=start)return;
        const place=slug?bySlug.get(slug):null;
        if(slug&&!place)throw new Error(`Unknown schedule location ${slug}`);
        // Split at opening/closing boundaries instead of claiming unexplained after-hours access.
        const intervals=place?openIntervals(place):[[0,1440]];
        const points=[...new Set([start,end,...intervals.flat().filter(n=>n>start&&n<end)])].sort((a,b)=>a-b);
        for(let index=0;index<points.length-1;index++){
          const from=points[index],to=points[index+1];
          const open=intervals.some(([a,b])=>from>=a&&to<=b);
          rows.push({characterVersionId:character.versionId,dayOfWeek:day,startMinute:from,endMinute:to,
            locationSlug:open?slug:null,activity:open?activity:'At home while the venue is closed',availability:open?availability:'limited',
            energyDelta:kind==='sleep'?1:availability==='busy'&&open?-1:0,moodInfluence:kind==='sleep'?'calm':availability==='busy'&&open?'focused':'calm',variationWeight:1,
            metadata:{scheduleMode:'authored',worldSlug:'eos-meridian',source:'eos_editorial_v3',dayType:off?'rest_day':'work_day',userLocalClock:true,rosterStart:roster.start,rosterEnd:roster.end,priority:kind==='work'&&open?'hard_obligation':'recurring_routine',profileVisibility:slug&&open?'known':'hidden'}});
        }
      };
      const wake=late?600:Math.max(300,roster.start-60);
      add(0,wake,null,'Sleeping at home','limited','sleep');
      if(off){
        add(wake,720,null,`A slow start and ${character.interests[0]}`,'limited','personal');
        add(720,840,character.districtSlug,'Neighborhood errands and a day-off walk','available','personal');
        add(840,1080,null,character.characterBible.editorialLife.ordinaryWish,'available','personal');
        add(1080,1200,character.socialSlug,'An optional meal or catch-up with friends','available','social');
        add(1200,1440,null,'An evening at home with no work shift','limited','personal');
      }else{
        add(wake,roster.start,null,'Breakfast and preparation at home','limited','personal');
        const middle=Math.floor((roster.start+roster.end)/2);
        add(roster.start,middle,character.workSlug,`Working as ${character.occupation.toLowerCase()}`,'busy','work');
        add(middle,middle+30,character.workSlug,'A meal break away from duties','limited','personal');
        add(middle+30,roster.end,character.workSlug,`Finishing ${character.occupation.toLowerCase()} duties and handover`,'busy','work');
        const socialEnd=Math.min(roster.end+90,1320);
        add(roster.end,socialEnd,character.socialSlug,'Post-shift food or company by invitation','available','social');
        add(Math.max(roster.end,socialEnd),1440,null,`Personal time: ${character.interests[1]}`,'limited','personal');
      }
    }
  }
  return rows;
}
