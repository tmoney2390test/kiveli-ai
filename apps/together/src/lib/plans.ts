export type PlanActivityId = 'coffee_juniper'|'dinner_juniper'|'riverwalk'|'open_mic'|'rooftop_movie'|'northside_trivia'|'photo_walk';

export type PlanOption = {
  id: PlanActivityId;
  title: string;
  description: string;
  locationId: string;
  tags: string[];
  reason: string;
};

export type PlanContext = {
  activity: string;
  mood: string;
  locationId?: string|null;
  interests?: string[];
  relationshipStage: string;
  hour?: number;
};

const locations = {
  juniper: '11000000-0000-4000-8000-000000000001',
  rooftop: '11000000-0000-4000-8000-000000000003',
  northside: '11000000-0000-4000-8000-000000000004',
  riverwalk: '11000000-0000-4000-8000-000000000005',
} as const;

const activities: Array<Omit<PlanOption,'reason'>> = [
  {id:'coffee_juniper',title:'Coffee at Juniper',description:'A low-key hour to catch up without making it a whole production.',locationId:locations.juniper,tags:['coffee','quiet','morning','friend']},
  {id:'dinner_juniper',title:'Dinner at Juniper',description:'Good food and enough time for the conversation to go somewhere.',locationId:locations.juniper,tags:['food','romantic','evening']},
  {id:'riverwalk',title:'Sunset Riverwalk',description:'An unhurried walk as the city lights come on.',locationId:locations.riverwalk,tags:['outdoors','quiet','romantic','evening']},
  {id:'open_mic',title:'Open Mic at Juniper',description:'Grab a table near the stage and judge the songs together.',locationId:locations.juniper,tags:['music','playful','evening']},
  {id:'rooftop_movie',title:'Rooftop Movie Night',description:'A movie, the skyline, and room for commentary during the bad parts.',locationId:locations.rooftop,tags:['movies','romantic','playful','evening']},
  {id:'northside_trivia',title:'Trivia at Northside',description:'Pick a team name and find out who gets too competitive.',locationId:locations.northside,tags:['playful','social','evening']},
  {id:'photo_walk',title:'City Photo Walk',description:'Explore a few blocks and trade ideas for the best shot.',locationId:locations.riverwalk,tags:['photography','creative','outdoors']},
];

export function recommendPlanOptions(context:PlanContext):PlanOption[]{
  const words=`${context.activity} ${context.mood} ${(context.interests??[]).join(' ')}`.toLowerCase();
  const romantic=['flirting','dating','exclusive','long_term'].includes(context.relationshipStage);
  const hour=context.hour??new Date().getHours();
  return activities.map((option,index)=>{
    let score=-index*.01;
    if(option.locationId===context.locationId)score+=3;
    for(const tag of option.tags)if(words.includes(tag))score+=2;
    if(option.tags.includes(hour>=16?'evening':'morning'))score+=1;
    if(option.tags.includes('romantic'))score+=romantic?1.5:-.75;
    const reason=option.locationId===context.locationId?'Fits where they are now':option.tags.some((tag)=>words.includes(tag))?`Matches ${context.mood.toLowerCase()} energy`:option.tags.includes('romantic')&&romantic?'Fits where your relationship is':'A change of pace';
    return{...option,reason,score};
  }).sort((left,right)=>right.score-left.score).slice(0,4).map((option)=>({id:option.id,title:option.title,description:option.description,locationId:option.locationId,tags:option.tags,reason:option.reason}));
}

export function buildPlanSlots(now=new Date()):Array<{label:string;detail:string;value:string}>{
  const tonight=atLocalTime(now,0,19,0);
  if(tonight.getTime()<now.getTime()+45*60000)tonight.setDate(tonight.getDate()+1);
  const tomorrow=atLocalTime(now,1,19,0);
  const weekend=atLocalTime(now,(6-now.getDay()+7)%7||7,18,30);
  const unique=[tonight,tomorrow,weekend].filter((value,index,list)=>list.findIndex((item)=>item.getTime()===value.getTime())===index);
  return unique.map((value,index)=>({label:index===0&&value.getDate()===now.getDate()?'Tonight':index===0?'Tomorrow evening':index===1?'Tomorrow':'This weekend',detail:value.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),value:value.toISOString()}));
}

function atLocalTime(now:Date,days:number,hour:number,minute:number){const value=new Date(now);value.setDate(value.getDate()+days);value.setHours(hour,minute,0,0);return value;}
