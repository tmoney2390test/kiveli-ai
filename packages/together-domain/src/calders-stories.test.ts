import {it,expect} from 'vitest';
import {applyCalderStoryAction,calderStoryView,calderStoryContext,type CalderArc} from './calders-stories';
const arc:CalderArc={slug:'the-crowcut-reckoning',title:'The Reckoning',openingHook:'A neutral meeting.',characterIds:['cole'],locationIds:['relay','crowcut'],stages:[{index:1,title:'Relay',scene:'Meet at the relay.'},{index:2,title:'Hollow',scene:'Accept an invitation.'},{index:3,title:'Decision',scene:'Decide.'}],clues:[{id:'private-letter',title:'A private letter',holderCharacterId:'cole',originLocationId:'relay',revealGate:'Voluntary disclosure'}],endings:[{key:'leave',title:'Leave',consequences:'Cole leaves the crew.'},{key:'stay',title:'Stay',consequences:'Cole stays with the crew.'}],declineOption:'You can pause.'};
it('keeps future scenes, undisclosed clues and unchosen outcomes out of views',()=>{
  const view=calderStoryView([arc],{});
  expect(JSON.stringify(view)).not.toContain('private-letter');expect(JSON.stringify(view)).not.toContain('Cole leaves');expect(view[0]?.scene).toBeNull();
});
it('requires an actual saved transition for Crowcut and a final-stage exclusive ending',()=>{
  const start=applyCalderStoryAction({arcs:[arc],state:{},action:{type:'start',arcSlug:arc.slug}});
  expect(start.flags).toEqual([]);
  expect(()=>applyCalderStoryAction({arcs:[arc],state:start,action:{type:'resolve',arcSlug:arc.slug,choiceId:'leave'}})).toThrow();
  const second=applyCalderStoryAction({arcs:[arc],state:start,action:{type:'advance',arcSlug:arc.slug}});
  expect(second.flags).toContain('crowcut.access_granted');
  expect(()=>applyCalderStoryAction({arcs:[arc],state:second,action:{type:'advance',arcSlug:arc.slug}})).toThrow('evidence');
  const investigated=applyCalderStoryAction({arcs:[arc],state:second,action:{type:'investigate',arcSlug:arc.slug,choiceId:'private-letter'},eligibleEvidenceIds:['private-letter']});
  const third=applyCalderStoryAction({arcs:[arc],state:investigated,action:{type:'advance',arcSlug:arc.slug}});
  const end=applyCalderStoryAction({arcs:[arc],state:third,action:{type:'resolve',arcSlug:arc.slug,choiceId:'leave'}});
  expect(end.arcs[arc.slug]?.ending).toBe('leave');
  expect(()=>applyCalderStoryAction({arcs:[arc],state:end,action:{type:'resolve',arcSlug:arc.slug,choiceId:'stay'}})).toThrow();
  expect(JSON.stringify(calderStoryView([arc],end))).not.toContain('Cole stays');
});
it('grounds only the current chapter for its own participants',()=>{
  const state=applyCalderStoryAction({arcs:[arc],state:{},action:{type:'start',arcSlug:arc.slug}});
  expect(calderStoryContext([arc],state,'unrelated')).toEqual([]);
  const context=JSON.stringify(calderStoryContext([arc],state,'cole'));
  expect(context).toContain('Meet at the relay.');
  expect(context).not.toContain('Accept an invitation.');
  expect(context).not.toContain('private-letter');
  expect(context).not.toContain('Cole leaves');
});
it('does not turn a guessed clue ID into a disclosure',()=>{
  const state=applyCalderStoryAction({arcs:[arc],state:{},action:{type:'start',arcSlug:arc.slug}});
  expect(()=>applyCalderStoryAction({arcs:[arc],state,action:{type:'investigate',arcSlug:arc.slug,choiceId:'private-letter'}})).toThrow();
});
