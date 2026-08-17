import{describe,expect,it}from'vitest';
import{deterministicPlaceOpinionCandidates,validatePlaceOpinionCandidates}from'../src/place-opinion-analysis.ts';

const places=[{slug:'velvet-hour',name:'Velvet Hour',current:true,existingView:null}];
const input=(assistantMessage:string)=>({assistantMessage,places});

describe('place opinion analysis boundary',()=>{
  it('captures an explicit companion opinion about the canonical current place',()=>{const result=deterministicPlaceOpinionCandidates(input('I really like this place when the piano side stays quiet.'));expect(result).toHaveLength(1);expect(result[0]?.placeRef).toBe('velvet-hour');expect(result[0]?.sentiment).toBeGreaterThan(0);});
  it('does not turn an objective description into companion opinion',()=>{expect(deterministicPlaceOpinionCandidates(input('The piano is near the back.'))).toEqual([]);});
  it('rejects model-proposed places outside canonical context',()=>{const result=validatePlaceOpinionCandidates([{placeRef:'invented-club',sentiment:1,confidence:.95,summary:'I love it.',tags:[],favoriteDetails:[],dislikedDetails:[],reasoningCode:'explicit_character_opinion'}],input('I really love it here.'));expect(result).toEqual([]);});
  it('accepts a grounded changed opinion with bounded values',()=>{const result=validatePlaceOpinionCandidates([{placeRef:'velvet-hour',sentiment:4,confidence:1,summary:'It is growing on me now that the room is quieter.',tags:['quiet'],favoriteDetails:['piano booths'],dislikedDetails:[],reasoningCode:'opinion_changed'}],input('It is growing on me now that the room is quieter.'));expect(result[0]?.sentiment).toBe(1);expect(result[0]?.confidence).toBe(.95);});
});
