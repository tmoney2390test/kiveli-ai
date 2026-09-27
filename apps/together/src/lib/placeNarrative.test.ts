import{describe,expect,it}from'vitest';
import{buildPlaceNarrative}from'./placeNarrative';

describe('place narrative',()=>{
  it('shows only public overview and distinct backstory, not internal lore',()=>{
    const paragraphs=buildPlaceNarrative({
      description:'A quiet observatory at the edge of permanent night.',
      backstory:'Its researchers first mapped the night-side auroras.',
      lore:{
        summary:'A quiet observatory at the edge of permanent night.',
        atmosphere:['lived-in','shift-shaped'],
        sensoryDetails:['warm task lighting','aurora reflections'],
        publicHistory:['The original dome still anchors the research wing.'],
        conversationHooks:['Let the researchers disagree about the signal.'],
        localEtiquette:['Check access before entering the lab.'],
        storySeeds:['A signal spike might change the shift.'],
        recurringPeople:[{label:'night-shift researchers',role:'astronomers and technicians',rhythm:'They trade observations over strong coffee.'}],
      },
    });
    expect(paragraphs).toEqual(['A quiet observatory at the edge of permanent night. Its researchers first mapped the night-side auroras.']);
  });

  it('does not leak Rain Room planning notes or repeat its booking history',()=>{
    expect(buildPlaceNarrative({
      description:'Scheduled rainfall turns a public conservatory into a beloved sensory ritual.',
      backstory:'A booking dispute led to separately marked quiet and communal sessions.',
      lore:{
        summary:'Scheduled rainfall turns a public conservatory into a beloved sensory ritual.',
        publicHistory:['A booking dispute led to separately marked quiet and communal sessions.'],
        storySeeds:['A cancelled cycle is possible during a verified fault, not proof all colony water is unsafe.'],
      },
    })).toEqual(['Scheduled rainfall turns a public conservatory into a beloved sensory ritual. A booking dispute led to separately marked quiet and communal sessions.']);
  });

  it('deduplicates an identical summary and description and omits empty sections',()=>{
    expect(buildPlaceNarrative({description:'A harbor café.',lore:{summary:'A harbor café.'}})).toEqual(['A harbor café.']);
  });
});
