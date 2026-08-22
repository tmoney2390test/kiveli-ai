import{describe,expect,it}from'vitest';
import{buildAutoDialoguePrompt,deterministicAutoDialogue,inferAutoDialogueIntents,inferAutoDialogueStyle,parseAutoDialogueSuggestion,type AutoDialogueInput}from'./auto-dialogue';

const input:AutoDialogueInput={characterName:'Brooke',latestAssistantMessage:'I finally finished hanging the last piece. I am exhausted.',recent:[{role:'user',content:'How did the installation go?'},{role:'assistant',content:'I finally finished hanging the last piece. I am exhausted.'}],scene:{interactionMode:'remote',location:'Glassline Gallery',activity:'finishing an installation',mood:'tired'},relationshipStage:'long_term',relationship:{romanceEnabled:true,friendsOnly:false,conflict:0,chemistryHeat:62,spiceLevel:3}};

describe('auto dialogue',()=>{
  it('derives a rich low-risk contextual fallback from the latest turn',()=>{
    expect(deterministicAutoDialogue(input)).toBe("You sound like you have a lot on your mind. You don't have to make it sound okay for me—what happened?");
  });

  it('grounds co-present fallbacks in the current scene while matching action style',()=>{
    const suggestion=deterministicAutoDialogue({...input,latestAssistantMessage:'There you are.',recent:[{role:'user',content:'*I sit beside her.* Hey.'}],scene:{...input.scene,interactionMode:'co_present'}});
    expect(suggestion).toContain('Brooke');
    expect(suggestion).toContain('finishing an installation');
  });

  it('rejects companion-shaped, high-agency, and copied model output',()=>{
    expect(parseAutoDialogueSuggestion({text:'Assistant: I smile back.'},'Tell me more.',input)).toBe('Tell me more.');
    expect(parseAutoDialogueSuggestion({text:'Brooke smiles and tells me everything.'},'Tell me more.',input)).toBe('Tell me more.');
    expect(parseAutoDialogueSuggestion({text:'I promise I will move in with you.'},'Let me think about that.',input)).toBe('Let me think about that.');
    expect(parseAutoDialogueSuggestion({text:'I finally finished hanging the very last piece and I am exhausted.'},'How do you feel?',input)).toBe('How do you feel?');
    expect(parseAutoDialogueSuggestion({text:'x'.repeat(800)},'fallback',input)).toHaveLength(600);
  });

  it('learns length, register, emoji, and action habits only from sent user turns',()=>{
    const style=inferAutoDialogueStyle([{role:'assistant',content:'*I wave.* This assistant style should not count.'},{role:'user',content:'*I sit down.* yeah, tell me everything 😊'},{role:'user',content:'*I lean closer.* haha okay 😊'}]);
    expect(style.usesActions).toBe(true);
    expect(style.actionFrequency).toBe('often');
    expect(style.register).toBe('casual');
    expect(style.emojiPreference).toBe('sometimes');
    expect(inferAutoDialogueStyle([{role:'user',content:'Tell me everything.'}],'detailed').targetLength).toBe('long');
  });

  it('ranks dynamic intentions from relationship and full scene state',()=>{
    expect(inferAutoDialogueIntents({...input,preference:'romantic'})[0]).toBe('support');
    expect(inferAutoDialogueIntents({...input,latestAssistantMessage:'You look incredible tonight.',preference:'romantic'})[0]).toBe('flirt');
    expect(inferAutoDialogueIntents({...input,latestAssistantMessage:'Ready?',upcomingCommitment:'Dinner at Velvet Hour'})).toContain('coordinate_plan');
    expect(inferAutoDialogueIntents({...input,latestAssistantMessage:'Well?',scene:{...input.scene,participantNames:['Brooke','Maya']}})).toContain('engage_group');
    expect(inferAutoDialogueIntents({...input,latestAssistantMessage:'You look incredible tonight.',preference:'romantic',relationship:{...input.relationship,friendsOnly:true}})).not.toContain('flirt');
  });

  it('builds a voice-matched, two-beat user draft prompt with relationship and scene grounding',()=>{
    const prompt=buildAutoDialoguePrompt({...input,preference:'assertive',scene:{...input.scene,departurePressure:true,nextObligation:'Meet Priya',participantNames:['Brooke','Maya']},activeStory:'The gallery opening',voiceHints:['conversation pacing: concise']});
    expect(prompt).toContain('next message for the USER');
    expect(prompt).toContain('Never write the companion');
    expect(prompt).toContain('rich conversational handoff with two beats');
    expect(prompt).toContain('Do not default to a generic interviewer question');
    expect(prompt).toContain('effective spice 3 of 3');
    expect(prompt).toContain('Meet Priya');
    expect(prompt).toContain('Maya');
    expect(prompt).toContain('The gallery opening');
    expect(prompt).toContain('conversation pacing: concise');
    expect(prompt).toContain(input.latestAssistantMessage);
  });

  it('can continue a canonically accepted Explicit exchange without inventing companion consent',()=>{
    const explicit={...input,latestAssistantMessage:'I want you too.',contentMode:'explicit' as const,intimacyOutcome:'accepted' as const};
    expect(inferAutoDialogueIntents(explicit)).toContain('flirt');
    expect(deterministicAutoDialogue(explicit)).toBe('I want you too. Keep going.');
    const prompt=buildAutoDialoguePrompt(explicit);
    expect(prompt).toContain('canonically reciprocated');
    expect(prompt).toContain('latest intimacy outcome: accepted');
    expect(prompt).toContain('must not invent an unspoken physical action');
  });
});
