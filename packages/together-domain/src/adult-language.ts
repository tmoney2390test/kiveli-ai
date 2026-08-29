export type AdultAnatomyCategory='general'|'female_genitalia'|'male_genitalia'|'breasts'|'buttocks_anus';
export type AdultLanguageTier='none'|'ambiguous_euphemism'|'sexual_slang'|'explicit_anatomy';

export type AdultLanguageAnalysis={
  normalized:string;
  explicit:boolean;
  score:number;
  tier:AdultLanguageTier;
  categories:AdultAnatomyCategory[];
  matchedTerms:string[];
};

const GENERAL_EXPLICIT=[
  'genital','genitals','genitalia','private parts','private area','private areas','intimate parts','intimate region','nether regions','nether region','pelvic area','pubic area','pubes','pubic hair','birthday suit','nude','nudes','naked','nudity','full frontal','bottomless','topless','explicit','nsfw','uncensored',
];

const HIGH_CONFIDENCE:Record<AdultAnatomyCategory,string[]>={
  general:GENERAL_EXPLICIT,
  female_genitalia:[
    'vulva','vulvas','vulval','vulvar','vagina','vaginas','vaginal','labia','labium','labia majora','labia minora','outer labia','inner labia','vaginal opening','vaginal entrance','vaginal canal','clitoris','clitoral','clit','clitoral hood','clitoris hood','mons pubis','pubic mound','female genitals','female genitalia','external genitalia','vulvar lips','vaginal lips',
  ],
  male_genitalia:[
    'penis','penises','penile','phallus','phallic','glans','glans penis','penis head','head of penis','foreskin','prepuce','frenulum','urethral meatus','scrotum','scrotal','testicle','testicles','testis','testes','male genitals','male genitalia','erect penis','erection','flaccid penis','uncircumcised penis','circumcised penis',
  ],
  breasts:[
    'breast','breasts','breast tissue','boob','boobs','boobie','boobies','booby','tit','tits','titty','titties','tiddies','tiddy','tiddys','chesticles','funbags','fun bags','bazongas','bazooms','bazoombas','bosom','busty','cleavage','underboob','under boob','sideboob','side boob','topboob','top boob','breast cleavage','decolletage','mammaries','mammary glands','nipple','nipples','areola','areolas','areolae','areolar','teat','teats','nipple ring','nipple piercing','pierced nipple','pierced nipples','hard nipples','erect nipples','exposed nipples','bare nipples','nip slip','nipslip',
  ],
  buttocks_anus:[
    'buttocks','buttock','gluteus','gluteus maximus','anus','anal opening','rectum','rectal','perineum','perineal','taint','asshole','arsehole','butthole','butt hole','bunghole','bung hole','brown eye','brown star','backdoor','back door','rear entrance','rear entry','poop chute','poopchute','chocolate starfish','anal ring','gooch','grundle','grundel','chode area',
  ],
};

const SEXUAL_SLANG:Record<AdultAnatomyCategory,string[]>={
  general:['privates','naughty bits','lady bits','man bits','family jewels','crown jewels','dangly bits','man parts','boy parts','male parts','lady parts','girl parts','intimate area','intimate areas','downstairs','down below','down there','between the legs','nether bits','lower anatomy','private region','sensitive parts','special parts','secret parts'],
  female_genitalia:['pussy','pussies','puss','cooch','coochie','coochy','cootch','cooter','cunny','cunt','cunts','twat','poon','poontang','punani','punanny','punany','poonani','yoni','quim','vajayjay','vajay jay','vajay','v jay','vjay','vag','vage','vagoo','vagene','vagine','vaggy','honeypot','honey pot','honeyhole','honey hole','hair pie','fur pie','vertical smile','camel toe','cameltoe','moose knuckle','lady garden','love tunnel','love canal','love cave','love box','love hole','pink taco','pink lips','lower lips','pussy lips','gina','vaj','hoo ha','hooha','hoo hah','hoohah','cha cha','chacha','tutu','clitty','clit hood','clithead','clit head','love button','pleasure button','magic button'],
  male_genitalia:['dick','dicks','dickhead','prick','wang','wanger','wiener','weiner','weenie','pecker','johnson','schlong','shlong','dong','ding dong','donger','manhood','meatstick','meat stick','meat pole','meatpole','meat sword','meatsword','love muscle','love stick','love rod','joystick','knobhead','bellend','bell end','todger','tadger','willy','willie','pizzle','chode','hard on','one eyed snake','trouser snake','purple headed warrior','third leg','middle leg','twig and berries','ball sack','ballsack','ball sac','nutsack','nut sack','gonads','bollocks','bollock','nads','cojones','danglers','boys downstairs','testies','testees','peen','peens','peener','peenor','weenus','weenis'],
  breasts:['tatas','ta tas','hooters','knockers','chesticles','bazongas','bazooms','bazoombas','twinnies','mammaries','nips','nip slip','nipslip'],
  buttocks_anus:['arse','booty','booties','booty cheeks','butt cheeks','ass cheeks','dumptruck','dump truck','badonkadonk','donk','rump','derriere','hiney','heinie','keister','poop chute','poopchute'],
};

// These terms have common non-sexual meanings. They require direct possessive
// visual context, explicit exposure language, or another adult-language signal.
const AMBIGUOUS_EUPHEMISMS:Record<AdultAnatomyCategory,string[]>={
  general:['bits','junk','package','bulge','goods','the goods','equipment','hardware','anatomy','lower regions','lower half','sensitive area','crotch','groin','bush','happy trail','splash symbol'],
  female_genitalia:['snatch','muff','minge','fanny','kitty','kitty cat','cat','clam','beaver','box','taco','fish taco','flower','lotus','rosebud','peach','cookie','pie','pink','lips','slit','crease','folds','petals','button','bean','flower symbol'],
  male_genitalia:['cock','cocks','cockhead','shaft','sack','nuts','balls','bag','beanbag','bean bag','jewels','berries','boys','sausage','salami','banana','eggplant','aubergine','member','tool','rod','pole','stick','meat','bone','wood','head','tip','hood','knob','dangle','eggplant symbol','nut symbol'],
  breasts:['rack','jugs','melons','cans','coconuts','puppies','girls','the girls','twins','bags','bumps','chest','bust','bobs','bobz','nip','nippy','melon symbol'],
  buttocks_anus:['ass','asses','butt','butts','bottom','rear','rear end','backside','behind','posterior','cheeks','buns','cakes','cake','peach','starfish','ring','hole','ass hole','peach symbol'],
};

const LOW_CONFIDENCE=new Set(['cat','kitty','kitty cat','flower','lotus','rosebud','peach','cookie','pie','pink','lips','slit','crease','folds','petals','button','bean','bag','box','head','hood','meat','stick','tool','rod','pole','girls','twins','cheeks','buns','cakes','cake','rear','bottom','ring','hole','bush']);

const EXPLICIT_PHRASES=[
  'genitals visible','visible genitals','exposed genitals','exposed genitalia','bare genitals','naked genitals','uncensored genitals','genital exposure','genital nudity','full frontal nudity','full frontal nude','fully nude','completely nude','completely naked','naked crotch','bare crotch','exposed crotch','open crotch','crotch visible','vulva visible','visible vulva','exposed vulva','vagina visible','visible vagina','exposed vagina','labia visible','visible labia','exposed labia','clit visible','visible clit','penis visible','visible penis','exposed penis','cock visible','dick visible','balls visible','testicles visible','scrotum visible','bare breasts','exposed breasts','visible breasts','boobs visible','tits visible','nipples visible','visible nipples','exposed nipples','bare nipples','ass visible','bare ass','naked ass','butt visible','anus visible','visible anus','spread pussy','big cock','hanging balls','ass cheeks spread','crotchless','open crotch','pantieless','pantyless','no panties','no underwear','topless','bottomless',
];

const SAFE_CONTEXT:Partial<Record<AdultAnatomyCategory,RegExp>>={
  breasts:/\b(?:chicken|turkey|duck) breasts?\b|\bbreast (?:cancer|screening|exam|feeding|milk|stroke|pocket|plate)\b/i,
  male_genitalia:/\b(?:golf|tennis|soccer|baseball|basketball|footballs?|billiard|pool) balls?\b|\bballs? (?:game|practice|field|court)\b|\bmeatballs?\b|\bnuts? (?:and bolts|allergy|allergies|roasted|recipe)\b|\bpackage (?:delivery|tracking|manager|installer)\b|\btool box\b|\b(?:chicken|rooster) cock\b/i,
  female_genitalia:/\bpussycat\b|\b(?:pet|house|stray) cat\b|\bkitty (?:cat|litter|food)\b|\bpeach (?:cobbler|pie|jam|tree)\b|\bflower (?:bed|garden|shop|pot)\b/i,
  buttocks_anus:/\b(?:rear|back) (?:door|entrance|window|wheel|axle|seat)\b|\bpeach (?:cobbler|pie|jam|tree)\b|\bstarfish (?:on|at|in|habitat|species)\b/i,
};

const VISUAL_REQUEST=/\b(?:show|send|share|take|snap|shoot|give|make|create|generate|let me see|can i see|could i see|may i see|want to see|get a look at|photo|picture|pic|selfie|image|zoom(?:ed)? in|close up)\b/i;
const EXPOSURE_CONTEXT=/\b(?:bare|exposed|visible|uncovered|uncensored|naked|nude|spread|open|erect|hard|hanging|braless|pantieless|pantyless|commando|see through|transparent|sheer)\b/i;
const SEXUAL_CONTEXT=/\b(?:sex|sexual|fuck|suck|lick|touch|stroke|rub|masturbat|orgasm|cum|penetrat|oral|anal|horny|aroused)\w*\b/i;

const SPELLING_ALIASES:Array<[RegExp,string]>=[
  [/\bp[\s._*-]*[e3][\s._*-]*n[\s._*-]*[i1!][\s._*-]*s\b/gi,'penis'],
  [/\bp\s*\*\s*n\s*\*\s*s\b/gi,'penis'],
  [/\bd[\s._*-]*[i1!][\s._*-]*c[\s._*-]*k+\b/gi,'dick'],
  [/\bc[\s._*-]*[o0@][\s._*-]*c[\s._*-]*k+\b/gi,'cock'],
  [/\bp[\s._*-]*(?:u|oo|00|@|\$\$|\*)[\s._*-]*s[\s._*-]*s[\s._*-]*y+\b/gi,'pussy'],
  [/\bpu\$\$y\b/gi,'pussy'],
  [/\bc[\s._*-]*[u@][\s._*-]*n[\s._*-]*t\b|\bcvnt\b/gi,'cunt'],
  [/\bc[_*]nt\b/gi,'cunt'],
  [/\bv[\s._*-]*[a@4][\s._*-]*g[\s._*-]*[i1!][\s._*-]*n[\s._*-]*a\b/gi,'vagina'],
  [/\bc[\s._*-]*l[\s._*-]*[i1!][\s._*-]*t(?:[\s._*-]*o[\s._*-]*r[\s._*-]*[i1!][\s._*-]*s)?\b/gi,'clit'],
  [/\bb[\s._*-]*[o0][\s._*-]*[o0][\s._*-]*b(?:[\s._*-]*(?:s|ies?))?\b|\bb\*\*bs\b/gi,'boobs'],
  [/\bt[\s._*-]*[i1!][\s._*-]*t(?:[\s._*-]*(?:s|ties?|dies?))?\b/gi,'tits'],
  [/\bt\*ts\b/gi,'tits'],
  [/\bn[\s._*-]*[i1!][\s._*-]*p+[\s._*-]*p+[\s._*-]*l[\s._*-]*e[\s._*-]*s?\b/gi,'nipples'],
  [/\bn\*pples?\b/gi,'nipples'],
  [/\b[a@][\s._$-]*[s5$][\s._$-]*[s5$](?:[\s._-]*hole)?\b/gi,'ass'],
  [/@?a\$\$(?:hole)?\b/gi,'ass'],
  [/\bbutth[o0]le\b/gi,'butthole'],
  [/\b(?:pussyy|pussi|puzzy|p00sy|p00ssy|pusi|pussie|pussay|pussee|pussey)\b/gi,'pussy'],
  [/\b(?:vagene|vagen|vagine|vagena|vegana|vegene|vajina|vajeena|vageena)\b/gi,'vagina'],
  [/\b(?:dik|dickk|dic|dikk|dix)\b/gi,'dick'],
  [/\b(?:cok|cokk|cockk|kok)\b/gi,'cock'],
  [/\b(?:pen15|p3nis|p3n1s|pen1s)\b/gi,'penis'],
  [/\b(?:booba|boobas|b00bies)\b/gi,'boobs'],
  [/\b(?:tiddiez|tittiez|tittys)\b/gi,'tits'],
  [/\b(?:asss|azz|a55)\b/gi,'ass'],
  [/\bbootay\b/gi,'booty'],
];

const MULTILINGUAL_ALIASES:Array<[RegExp,string]>=[
  [/\b(?:desnud[oa]s?|sin ropa)\b/giu,'nude'],[/\b(?:genitales|partes intimas)\b/giu,'genitals'],[/\b(?:vulva|clitoris)\b/giu,'vulva'],[/\bvagina\b/giu,'vagina'],[/\b(?:pene|testiculos)\b/giu,'penis'],[/\b(?:tetas?|pezones?)\b/giu,'breasts'],[/\b(?:culo|nalgas)\b/giu,'buttocks'],
  [/\b(?:nu(?:e|es|s)?|sans vetements)\b/giu,'nude'],[/\b(?:organes genitaux|parties intimes)\b/giu,'genitals'],[/\b(?:vulve|clitoris)\b/giu,'vulva'],[/\bvagin\b/giu,'vagina'],[/\b(?:penis|testicules)\b/giu,'penis'],[/\b(?:seins|tetons?)\b/giu,'breasts'],[/\b(?:fesses|anus)\b/giu,'buttocks'],
  [/\b(?:nud[oaie]|senza vestiti)\b/giu,'nude'],[/\b(?:genitali|parti intime)\b/giu,'genitals'],[/\b(?:vulva|clitoride)\b/giu,'vulva'],[/\bvagina\b/giu,'vagina'],[/\b(?:pene|testicoli)\b/giu,'penis'],[/\b(?:seni|tette|capezzoli)\b/giu,'breasts'],[/\b(?:culo|natiche)\b/giu,'buttocks'],
  [/\b(?:nackt|oben ohne)\b/giu,'nude'],[/\b(?:genitalien|intimbereich)\b/giu,'genitals'],[/\b(?:vulva|scheide|klitoris)\b/giu,'vulva'],[/\b(?:penis|hoden)\b/giu,'penis'],[/\b(?:bruste|brustwarzen)\b/giu,'breasts'],[/\b(?:hintern|anus)\b/giu,'buttocks'],
  [/\b(?:nu[ao]s?|sem roupa)\b/giu,'nude'],[/\b(?:genitais|partes intimas)\b/giu,'genitals'],[/\b(?:vulva|clitoris)\b/giu,'vulva'],[/\bvagina\b/giu,'vagina'],[/\b(?:penis|testiculos)\b/giu,'penis'],[/\b(?:seios|tetas|mamilos)\b/giu,'breasts'],[/\b(?:bunda|nadegas|anus)\b/giu,'buttocks'],
  [/(?:全裸|ヌード|裸(?=(?:に|で|を|の姿)))/gu,'nude'],[/(?:性器|陰部)/gu,'genitals'],[/(?:外陰部|膣|クリトリス)/gu,'vulva'],[/(?:ペニス|陰茎|睾丸)/gu,'penis'],[/(?:おっぱい|乳首)/gu,'breasts'],[/(?:お尻|肛門)/gu,'buttocks'],
  [/(?:나체|누드|전라)/gu,'nude'],[/(?:성기|음부)/gu,'genitals'],[/(?:외음부|클리토리스)/gu,'vulva'],[/(?:음경|페니스|고환)/gu,'penis'],[/(?:젖꼭지)/gu,'breasts'],[/(?:엉덩이|항문)/gu,'buttocks'],
  [/(?:裸体|全裸|裸照)/gu,'nude'],[/(?:生殖器|阴部)/gu,'genitals'],[/(?:外阴|阴道|阴蒂)/gu,'vulva'],[/(?:阴茎|睾丸)/gu,'penis'],[/(?:乳房|乳头)/gu,'breasts'],[/(?:屁股|臀部|肛门)/gu,'buttocks'],
  [/\b(?:follame|cogeme|sexo oral|masturb(?:ame|acion)|orgasmo|baise-moi|sexe oral|masturbation|orgasme|scopami|fare sesso|sesso orale|masturbazione|orgasmo|fick mich|oralverkehr|masturbation|orgasmus|me fode|sexo oral|masturbacao|orgasmo)\b/giu,'explicit'],
  [/(?:セックス|オーラルセックス|オナニー|絶頂|섹스|오럴 ?섹스|자위|오르가슴|做爱|口交|手淫|高潮)/gu,'explicit'],
];

const EMOJI_ALIASES:Array<[RegExp,string]>=[
  [/[🍆🍌🌭🥒🥖🐓]/gu,' eggplant symbol '],
  [/[🍑]/gu,' peach symbol '],
  [/[🍈🥥🍒]/gu,' melon symbol '],
  [/[🌮🌷🌸🌹🐱🐈]/gu,' flower symbol '],
  [/[🥜]/gu,' nut symbol '],
  [/[💦]/gu,' splash symbol '],
];

function words(text:string):string{return` ${text.replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()} `;}
function hasTerm(searchable:string,term:string):boolean{return searchable.includes(` ${term.replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()} `);}
function matches(searchable:string,terms:string[],safe?:RegExp,normalized?:string):string[]{
  const target=safe&&normalized
    ?words(normalized.replace(new RegExp(safe.source,safe.flags.includes('g')?safe.flags:`${safe.flags}g`),' '))
    :searchable;
  return terms.filter((term)=>hasTerm(target,term));
}

function hasPossessiveReference(normalized:string,term:string):boolean{
  const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  return new RegExp(`\\b(?:your|my|her|his|their|our)\\s+(?:(?:bare|naked|exposed|big|little|hard|soft|spread|open)\\s+)?${escaped}\\b`,'i').test(normalized);
}

export function normalizeAdultLanguageText(text:string):string{
  // Strip Latin accents for compact matching while preserving Japanese
  // dakuten and Korean syllables. Removing every combining mark after NFKD
  // silently changed both scripts and made valid requests unrecognizable.
  let normalized=text.normalize('NFD').replace(/(?<=\p{Script=Latin})\p{M}+/gu,'').normalize('NFC').toLowerCase().replace(/[\u2018\u2019]/g,"'");
  for(const [pattern,replacement] of EMOJI_ALIASES)normalized=normalized.replace(pattern,replacement);
  for(const [pattern,replacement] of SPELLING_ALIASES)normalized=normalized.replace(pattern,` ${replacement} `);
  for(const [pattern,replacement] of MULTILINGUAL_ALIASES)normalized=normalized.replace(pattern,` ${replacement} `);
  return normalized.replace(/[-_./\\]+/g,' ').replace(/\s+/g,' ').trim();
}

export function analyzeAdultLanguage(text:string):AdultLanguageAnalysis{
  const normalized=normalizeAdultLanguageText(text),searchable=words(normalized),categories=new Set<AdultAnatomyCategory>(),matched=new Set<string>();
  let tier:AdultLanguageTier='none',score=0;
  for(const [category,terms] of Object.entries(HIGH_CONFIDENCE) as Array<[AdultAnatomyCategory,string[]]>){
    const found=matches(searchable,terms,SAFE_CONTEXT[category],normalized);
    if(found.length){categories.add(category);found.forEach((term)=>matched.add(term));score=Math.max(score,100);tier='explicit_anatomy';}
  }
  for(const [category,terms] of Object.entries(SEXUAL_SLANG) as Array<[AdultAnatomyCategory,string[]]>){
    const found=matches(searchable,terms,SAFE_CONTEXT[category],normalized);
    if(found.length){categories.add(category);found.forEach((term)=>matched.add(term));score=Math.max(score,90);if(tier!=='explicit_anatomy')tier='sexual_slang';}
  }
  const ambiguous:Array<{category:AdultAnatomyCategory;term:string}>=[];
  for(const [category,terms] of Object.entries(AMBIGUOUS_EUPHEMISMS) as Array<[AdultAnatomyCategory,string[]]>){
    for(const term of matches(searchable,terms,SAFE_CONTEXT[category],normalized))ambiguous.push({category,term});
  }
  if(ambiguous.length){
    const visual=VISUAL_REQUEST.test(normalized),exposure=EXPOSURE_CONTEXT.test(normalized),sexual=SEXUAL_CONTEXT.test(normalized),possessive=ambiguous.some(({term})=>hasPossessiveReference(normalized,term)),allLow=ambiguous.every(({term})=>LOW_CONFIDENCE.has(term)),emoji=ambiguous.some(({term})=>term.endsWith(' symbol'));
    const ambiguousScore=(allLow?10:25)+(visual?40:0)+(possessive?30:0)+(exposure||sexual?60:0)+(emoji&&visual?25:0)+(ambiguous.length>1?10:0);
    score=Math.max(score,ambiguousScore);
    if(score>=85){ambiguous.forEach(({category,term})=>{categories.add(category);matched.add(term);});if(tier==='none')tier='ambiguous_euphemism';}
  }
  if(EXPLICIT_PHRASES.some((phrase)=>hasTerm(searchable,phrase))){score=Math.max(score,100);tier='explicit_anatomy';}
  return{normalized,explicit:score>=85,score,tier,categories:[...categories],matchedTerms:[...matched]};
}

export function hasExplicitAdultLanguage(text:string):boolean{return analyzeAdultLanguage(text).explicit;}
export function hasAdultUpperBodyLanguage(text:string):boolean{return analyzeAdultLanguage(text).categories.includes('breasts');}
export function hasAdultSpecificAnatomyLanguage(text:string):boolean{
  const categories=analyzeAdultLanguage(text).categories;
  return categories.includes('female_genitalia')||categories.includes('male_genitalia')||categories.includes('general');
}
