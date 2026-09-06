import { describe, expect, it } from 'vitest';
import { compileCompanionPrompt, compactCharacterBible, resolveResponseDirection } from '../../../supabase/functions/_shared/kivelle-intelligence.ts';
import { compileCharacterVoiceCard } from '../src/character-depth.ts';
import { normalizeCharacterPerformance } from '../src/character-performance.ts';

function context(name:string,occupation:string,goal:string){
  return { character:{name,age:35,occupation,character_bible:{occupation,ambitions:[goal],psychology:{worldview:'Choices have consequences.',contradictions:['Duty conflicts with affection.'],defenses:['Watchfulness']},performance:normalizeCharacterPerformance({occupation,ambitions:[goal]})}},
    userMessage:'The guards are outside. I am scared.',contentMode:'standard',conversationStyle:'texting',upcomingSchedule:[],recent:[],currentScene:{interactionMode:'co_present',activity:'Waiting in the hall',location:'The hall'},relationship:{relationship_stage:'friend'} };
}

describe('universal character prompt realism',()=>{
  it('keeps protected character psychology and boundaries under compaction regardless of insertion order',()=>{
    const data={imagePrompt:'Do not need this for dialogue.',unused:'x'.repeat(20000),psychology:{worldview:'Duty matters.',defenses:['Wit'],contradictions:['Protects a flawed ruler.']},ambitions:['Protect the city.'],languageRegister:'Medieval English',boundaries:['Keep private correspondence private.'],values:{autonomy:0.9},conflictStyle:{independentPointOfView:true}};
    const reversed=Object.fromEntries(Object.entries(data).reverse());
    for(const mode of ['full','compact','minimal'] as const){
      expect(compactCharacterBible(data,mode)).toEqual(compactCharacterBible(reversed,mode));
      expect(compactCharacterBible(data,mode)['psychology']).toMatchObject({defenses:['Wit'],contradictions:['Protects a flawed ruler.']});
      expect(compactCharacterBible(data,mode)['boundaries']).toEqual(data.boundaries);
      expect(compactCharacterBible(data,mode)['values']).toEqual(data.values);
      expect(compactCharacterBible(data,mode)['conflictStyle']).toEqual(data.conflictStyle);
    }
  });

  it('uses threat direction in both expression styles without changing the saved preference',()=>{
    for(const conversationStyle of ['texting','paragraph']){
      const source={...context('Rook','Knight','Keep the gate open.'),conversationStyle,responseBrief:{mode:'supportive'}};
      expect(resolveResponseDirection(source)).toMatchObject({intent:'danger',length:'short',style:conversationStyle});
      expect(source.conversationStyle).toBe(conversationStyle);
      const compiled=compileCompanionPrompt(source);
      expect(compiled.sections.find(s=>s.key==='SCENE_PRESSURE')).toMatchObject({included:true,required:true});
      expect(compiled.estimatedTokens).toBeLessThan(compiled.ceilingTokens);
      expect(compiled.prompt).toContain('Keep the gate open.');
    }
  });

  it('preserves each selected speaker’s performance and remote group boundaries',()=>{
    const source=context('Rook','Knight','Protect the gate.');
    const other=context('Vale','Intelligence broker','Find the missing ledger.');
    const groupContext={participants:[{name:'Rook',characterInstanceId:'r'},{name:'Vale',characterInstanceId:'v'}],action:{intent:'respond_to_character'}};
    const first=compileCompanionPrompt({...source,currentScene:{interactionMode:'remote'},groupContext,sceneSpeakerDirective:{name:'Rook'},characterVoice:compileCharacterVoiceCard({bible:source.character.character_bible,characterName:'Rook',message:source.userMessage,mode:'danger',interactionMode:'remote'})});
    const second=compileCompanionPrompt({...other,currentScene:{interactionMode:'remote'},groupContext,sceneSpeakerDirective:{name:'Vale'}});
    expect(first.prompt).toContain('Protect the gate.');expect(first.prompt).not.toContain('Find the missing ledger.');
    expect(second.prompt).toContain('Find the missing ledger.');expect(second.prompt).not.toContain('Protect the gate.');
    expect(first.prompt).toContain('persistent remote group chat');
    expect(second.prompt).toContain('without inventing physical arrival');
  });

  it('selects only current speech examples and omits unrelated empty context instructions',()=>{
    const compiled=compileCompanionPrompt(context('Unauthored future name','Orbital surveyor','Finish the survey honestly.'));
    expect(compiled.prompt).toContain('Voice examples');
    expect(compiled.sections.find(s=>s.key==='USER_SHARED_IMAGES')?.included).toBe(false);
    expect(compiled.sections.find(s=>s.key==='WORLD_PULSE')?.included).toBe(false);
    expect(compiled.prompt).not.toContain('The cup can wait.');
  });
});
