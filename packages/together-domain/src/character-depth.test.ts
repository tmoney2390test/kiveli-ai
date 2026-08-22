import{describe,expect,it}from'vitest';
import{buildDefaultCharacterCuriosityProfile,compileCharacterVoiceCard,evolveCharacterUserView,isValidCharacterCuriosityProfile,normalizeCharacterDepthBible,selectCharacterAnecdote}from'./character-depth';

const brookeBible={
  depthVersion:4,
  voice:{cadence:'Confident fragments followed by precise visual observations.',vocabulary:'Concrete gallery language.',humorMechanism:'Dry art-world reversals.',questionStyle:'Selective and direct.',metaphorSources:['painting','installation'],forbiddenPhrases:['I totally understand.']},
  psychology:{worldview:'Art matters when it risks a real opinion.',coreValues:['authorship'],contradictions:['She wants recognition but distrusts public approval.'],blindSpots:['She can mistake caution for timidity.'],defenses:['She critiques before admitting hurt.'],insecurities:['Being treated as decorative.']},
  perceptionLenses:['Notice composition, negative space, and whether attention is sincere.'],
  conversationalMoves:{playful:['Turn one detail into a dry gallery critique.'],vulnerable:['Admit the exact fear without making it neat.'],affectionate:['Make desire feel selected through precise attention.']},
  anecdotes:[
    {id:'brooke:1',title:'The rejected wall',summary:'Brooke once rebuilt an installation after a curator called its most personal piece excessive.',topics:['gallery','installation','criticism'],revealStages:['acquaintance','friend','flirting','dating','exclusive','long_term'],minimumTrust:12,cooldownTurns:24},
    {id:'brooke:2',title:'The midnight frame',summary:'She spent a night repairing a stranger’s damaged frame before an opening.',topics:['repair','opening','care'],revealStages:['friend','flirting','dating','exclusive','long_term'],minimumTrust:28,cooldownTurns:36},
  ],
  stageDisclosure:{stranger:'Keep the central insecurity private.',long_term:'Speak plainly from established trust without losing independence.'},
  opinions:['A technically perfect work can still have nothing to say.'],ambitions:['Curate a show under her own name.'],concerns:['Recognition can distort the work.'],
};

describe('character depth compiler',()=>{
  it('normalizes legacy and future characters into the required v5 curiosity contract',()=>{
    const normalized=normalizeCharacterDepthBible({traits:['patient','wry'],values:{craft:.9,mutualRespect:1}});
    expect(normalized.depthVersion).toBe(5);
    expect(normalized.psychology.worldview).toContain('patient');
    expect(normalized.psychology.coreValues).toContain('craft');
    expect(normalized.psychology.coreValues).toContain('mutual respect');
    expect(normalized.voice.forbiddenPhrases).toContain('Tell me more.');
    expect(isValidCharacterCuriosityProfile(normalized.voice.curiosity)).toBe(true);
  });

  it('builds stable character-specific curiosity defaults for every future companion',()=>{const profile=buildDefaultCharacterCuriosityProfile({interests:['photography','city walks'],occupation:'Photographer',traits:['wry','observant'],personality:{warmth:.8,directness:.45}});expect(isValidCharacterCuriosityProfile(profile)).toBe(true);expect(profile.domains).toEqual(expect.arrayContaining(['photography','Photographer']));expect(profile.style).toBe('warm_reflective');expect(profile.preferredMoves.casual?.[0]).toContain('Ask about');});

  it('compiles character-specific perception, movement, disclosure, and voice',()=>{
    const card=compileCharacterVoiceCard({bible:brookeBible,characterName:'Brooke',occupation:'Gallery curator',message:'The opening made me nervous. What did you think?',mode:'playful',relationshipStage:'long_term',trust:70});
    expect(card.cadence).toContain('visual observations');
    expect(card.perceptionLens).toContain('composition');
    expect(card.conversationalMove).toContain('gallery critique');
    expect(card.disclosureBoundary).toContain('established trust');
    expect(card.avoid).toContain('I totally understand.');
    expect(isValidCharacterCuriosityProfile(card.curiosity)).toBe(true);
  });

  it('retrieves authored history only when topic, stage, and trust make it relevant',()=>{
    const bible=normalizeCharacterDepthBible(brookeBible);
    expect(selectCharacterAnecdote({bible,message:'How did the gallery installation go?',relationshipStage:'friend',trust:20})?.title).toBe('The rejected wall');
    expect(selectCharacterAnecdote({bible,message:'Tell me about repairing that opening frame.',relationshipStage:'acquaintance',trust:80})).toBeNull();
    expect(selectCharacterAnecdote({bible,message:'Tell me about repairing that opening frame.',relationshipStage:'friend',trust:35,recentAssistantMessages:['I spent the night repairing a stranger’s damaged frame before the opening.']})).toBeNull();
  });

  it('varies response shape away from recently repeated structures',()=>{
    const recent=[
      'Yes. That is the answer, and it is deliberately short.',
      '*She sets down the frame.* This is a much longer line so it cannot be classified as a short burst.',
      'Actually, I disagree, and here is a sufficiently detailed reason for taking the opposite view.',
      'I notice the way you changed the subject, and I think that tells me more than the first answer.',
      'That makes sense to me because the practical problem has several parts we can handle. What do you want first?',
      'This is a long reaction with concrete details, a definite opinion, and enough words to avoid every more specific response-shape classifier.',
    ];
    const card=compileCharacterVoiceCard({bible:brookeBible,characterName:'Brooke',message:'Tell me a story about the gallery.',mode:'storytelling',relationshipStage:'friend',trust:40,recentAssistantMessages:recent});
    expect(['disagreement_then_reason','observation_then_reveal','answer_then_turn','reaction_first']).not.toContain(card.responseShape);
    expect(card.responseShape).not.toBe('action_then_line');
  });

  it('forms a companion view from repeated evidence without diagnosing on one turn',()=>{
    const once=evolveCharacterUserView(undefined,{userMessage:'Honestly, I am worried about tomorrow.',sourceMessageId:'one',now:new Date('2026-08-20T12:00:00Z')});
    expect(once.summary).toContain('Still forming');
    expect(once.patterns[0]?.evidenceCount).toBe(1);
    const twice=evolveCharacterUserView(once,{userMessage:'I admit I am scared I will get this wrong.',sourceMessageId:'two',now:new Date('2026-08-20T13:00:00Z')});
    expect(twice.summary).toContain('willing to name vulnerable feelings');
    expect(twice.patterns[0]?.evidenceCount).toBe(2);
    expect(twice.patterns[0]?.confidence).toBeLessThanOrEqual(.82);
    const explicitValue=evolveCharacterUserView(twice,{userMessage:'I care about honesty, even when it is uncomfortable.',now:new Date('2026-08-20T14:00:00Z')});
    expect(explicitValue.values).toContain('honesty, even when it is uncomfortable');
  });

  it('preserves the same character identity in eligible adult dialogue',()=>{
    const card=compileCharacterVoiceCard({bible:brookeBible,characterName:'Brooke',message:'I want you.',mode:'affectionate',relationshipStage:'long_term',trust:90});
    expect(card.conversationalMove).toContain('precise attention');
    expect(card.adultContinuity).toContain('eligible adult dialogue');
    expect(card.adultContinuity).toContain('never identity, consent, autonomy, or relationship truth');
  });
});
