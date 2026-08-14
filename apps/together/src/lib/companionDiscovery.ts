export type CompanionChoice={id:string;name:string;slug:string;occupation:string;summary:string;traits:string[];interests:string[];goals:string[]};

export const companionChoices:CompanionChoice[]=[
  {id:'12000000-0000-4000-8000-000000000001',name:'Maya',slug:'maya',occupation:'Photographer',summary:'Playful, perceptive, and independent—with a soft spot for stories hiding in plain sight.',traits:['Playful','Creative','Warm'],interests:['Photography','Movies','Music','Food','Sports'],goals:['Dating','Friendship','Stories']},
  {id:'12000000-0000-4000-8000-000000000004',name:'Sofia',slug:'sofia',occupation:'Architect',summary:'Confident and thoughtful, with an eye for beautiful spaces and honest conversation.',traits:['Confident','Thoughtful','Romantic'],interests:['Travel','Food','Books','Outdoors'],goals:['Dating','Stories']},
  {id:'12000000-0000-4000-8000-000000000005',name:'Avery',slug:'avery',occupation:'Music Producer',summary:'Quick-witted, spontaneous, and always looking for the next unforgettable night.',traits:['Witty','Bold','Spontaneous'],interests:['Music','Gaming','Technology','Food'],goals:['Dating','Friendship','Social worlds']},
  {id:'12000000-0000-4000-8000-000000000006',name:'Riley',slug:'riley',occupation:'Bookshop Owner',summary:'Grounded and curious, with dry humor and a love of conversations that take their time.',traits:['Curious','Calm','Sincere'],interests:['Books','Movies','Outdoors','Food'],goals:['Friendship','Dating','Stories']},
  {id:'12000000-0000-4000-8000-000000000007',name:'Elena',slug:'elena',occupation:'Product Designer',summary:'Ambitious, empathetic, and fascinated by what makes people feel understood.',traits:['Driven','Empathetic','Modern'],interests:['Technology','Travel','Photography','Music'],goals:['Dating','Friendship','Social worlds']},
  {id:'12000000-0000-4000-8000-000000000008',name:'Harper',slug:'harper',occupation:'Travel Writer',summary:'Adventurous and observant, collecting great stories everywhere she goes.',traits:['Adventurous','Open','Funny'],interests:['Travel','Outdoors','Books','Photography'],goals:['Dating','Stories','Social worlds']},
];

export function rankCompanions(goals:string[],interests:string[],choices=companionChoices){
  return [...choices].sort((a,b)=>score(b)-score(a));
  function score(choice:CompanionChoice){return choice.goals.filter((item)=>goals.includes(item)).length*3+choice.interests.filter((item)=>interests.includes(item)).length;}
}
