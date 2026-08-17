import{describe,expect,it}from'vitest';
import{selectCharacterPlacePerspective}from'./placePerspective';
import type{CharacterInstance,Location,Snapshot}from'../types';

const character={id:'maya',character_version_id:'maya-v'}as CharacterInstance;
const location={id:'velvet',world_id:'juniper',slug:'velvet-hour',name:'Velvet Hour'}as Location;
const snapshot={characterPlaceProfiles:[{id:'profile',character_version_id:'maya-v',location_id:'velvet',familiarity:.5,sentiment:.6,confidence:.8,opinion_summary:'Likes the piano-side booths.',opinion_tags:['music'],preferred_activities:['conversation'],favorite_details:['piano'],disliked_details:[],metadata:{}}],relationshipPlaces:[]}as unknown as Snapshot;
describe('client place perspective',()=>{
  it('uses authored perspective before shared evidence exists',()=>{expect(selectCharacterPlacePerspective(snapshot,character,location).summary).toContain('piano-side');});
  it('prefers learned opinion while preserving authored details',()=>{const learned={...snapshot,relationshipPlaces:[{id:'learned',user_id:'u',continuity_id:'c',character_instance_id:'maya',location_id:'velvet',visit_count:2,moment_ids:[],familiarity:.7,sentiment:-.2,confidence:.75,opinion_summary:'The weekend crowd has made it less appealing.',opinion_tags:['crowded'],favorite_details:[],disliked_details:['weekend crowd'],evidence_count:2,metadata:{}}]};const view=selectCharacterPlacePerspective(learned,character,location);expect(view.summary).toContain('weekend crowd');expect(view.favoriteDetails).toContain('piano');expect(view.source).toBe('combined');});
});
