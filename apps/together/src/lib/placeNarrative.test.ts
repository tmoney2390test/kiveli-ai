import{describe,expect,it}from'vitest';
import{buildPlaceNarrative}from'./placeNarrative';

describe('place narrative',()=>{
  it('combines overview, atmosphere, history, and recurring locals into prose',()=>{
    const paragraphs=buildPlaceNarrative({
      description:'A quiet observatory at the edge of permanent night.',
      backstory:'Its researchers first mapped the night-side auroras.',
      socialTexture:'Shift changes bring careful conversation to the workroom.',
      crowdNow:'Early workers establish the practical rhythm.',
      lore:{
        summary:'A quiet observatory at the edge of permanent night.',
        atmosphere:['lived-in','shift-shaped'],
        sensoryDetails:['warm task lighting','aurora reflections'],
        publicHistory:['The original dome still anchors the research wing.'],
        recurringPeople:[{label:'night-shift researchers',role:'astronomers and technicians',rhythm:'They trade observations over strong coffee.'}],
      },
    });
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[0]).toBe('A quiet observatory at the edge of permanent night. Its researchers first mapped the night-side auroras.');
    expect(paragraphs[1]).toContain('You’ll notice warm task lighting and aurora reflections.');
    expect(paragraphs[2]).toContain('original dome');
    expect(paragraphs[3]).toContain('Familiar faces include night-shift researchers — astronomers and technicians.');
  });

  it('deduplicates an identical summary and description and omits empty sections',()=>{
    expect(buildPlaceNarrative({description:'A harbor café.',lore:{summary:'A harbor café.'}})).toEqual(['A harbor café.']);
  });
});
