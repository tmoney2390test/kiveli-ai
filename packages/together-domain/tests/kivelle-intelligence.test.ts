import{describe,expect,it}from'vitest';
import{buildCompanionPrompt}from'../../../supabase/functions/_shared/kivelle-intelligence.ts';

const baseContext={
  character:{name:'Maya',occupation:'Photographer'},
  persona:{display_name:'Tim'},
  relationship:{relationship_stage:'friend',conflict:0},
  currentScene:{location:'Studio',activity:'editing photos',mood:'content',energy:'medium',availability:'available',source:'schedule'},
  clock:{localDate:'2026-08-15',localTime:'21:30',timezone:'America/New_York',daypart:'evening'},
  sharedPlans:[{id:'plan-1',title:'Drinks at Velvet Hour',activityKey:'drinks',status:'scheduled',startsAtLabel:'Saturday 8:00 PM',endsAtLabel:'Saturday 9:30 PM',location:'Velvet Hour'}],
  commitments:[{id:'plan-1',title:'Drinks at Velvet Hour',status:'scheduled',temporalState:'future',relevance:.5,timePrecision:'exact',startsAt:'2026-08-22T00:00:00Z',endsAt:'2026-08-22T01:30:00Z',windowStartsAt:null,windowEndsAt:null,worldTimezone:'America/New_York',userTimezone:'America/New_York',location:'Velvet Hour',userJoinedAt:null,characterJoinedAt:null,companionState:'expected',companionEtaAt:null,companionReason:null,missReason:null,missResolutionStatus:null,missExplanation:null}],
  dates:{active:null,upcoming:[],unlocked:[],recentCompleted:[]},
  memories:[],openThreads:[],social:[],knownLifeEvents:[],sharedHistory:[],recentMedia:[],recent:[],upcomingSchedule:[],
  subscription:{intelligenceProfile:'core'},director:{used:false},responseBrief:{mode:'casual',initiative:'medium',emotionalPosture:'Natural.',selfDisclosure:'none',shouldAskQuestion:false,actionCandidate:'none',avoid:[],autonomy:'Independent.'},
};

describe('Kivelle continuity prompt salience',()=>{
  it('keeps a future plan out of an unrelated reply prompt',()=>{const prompt=buildCompanionPrompt({...baseContext,userMessage:'My boss was being ridiculous today.',queryIntent:'general',conversationFocus:{type:'plan',planId:'plan-1',title:'Drinks at Velvet Hour',location:'Velvet Hour'}});expect(prompt).toContain('<UPCOMING_PLANS>None.</UPCOMING_PLANS>');expect(prompt).toContain('<COMMITMENTS>None.</COMMITMENTS>');expect(prompt).toContain('<CONVERSATION_FOCUS>None.</CONVERSATION_FOCUS>');expect(prompt).toContain('Callback candidate: None.');});
  it('surfaces plan context when the user reopens the plan',()=>{const prompt=buildCompanionPrompt({...baseContext,userMessage:'Are we still on for Saturday?',queryIntent:'schedule',conversationFocus:{type:'plan',planId:'plan-1',title:'Drinks at Velvet Hour',location:'Velvet Hour'},responseBrief:{...baseContext.responseBrief,mode:'practical',callbackCandidate:'Drinks at Velvet Hour'}});expect(prompt).toContain('Drinks at Velvet Hour');expect(prompt).not.toContain('<CONVERSATION_FOCUS>None.</CONVERSATION_FOCUS>');expect(prompt).toContain('Callback candidate: Drinks at Velvet Hour');});
  it('keeps an active story as background on unrelated messages',()=>{const prompt=buildCompanionPrompt({...baseContext,userMessage:'I am wiped out after work.',queryIntent:'general',activeStory:{title:'Gallery Opportunity',chapterTitle:'Submission',knownSummary:'A deadline is approaching.'}});expect(prompt).toContain('Gallery Opportunity');expect(prompt).toContain('Response intent: casual');expect(prompt).toContain('This is background unless the current message or callback candidate reopens it.');});
  it('marks memories as background rather than required callbacks',()=>{const prompt=buildCompanionPrompt({...baseContext,userMessage:'What a weird day.',queryIntent:'general',memories:[{type:'semantic',text:'User has a dog named Winston.'}]});expect(prompt).toContain('Background knowledge. Use silently unless the current message clearly benefits from a specific callback.');expect(prompt).toContain('A natural reply often contains no explicit continuity reference at all.');});
});
