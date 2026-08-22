import { buildSnapshot } from './together.ts';

function assert(condition:unknown,message:string){if(!condition)throw new Error(message);}

function onboardingDb(){
  const queried:string[]=[];
  const results:Record<string,{data:unknown;error:null}>={
    together_profiles:{data:null,error:null},
    together_worlds:{data:[{id:'world-1',slug:'juniper-city',published:true}],error:null},
    together_locations:{data:[{id:'location-1',world_id:'world-1',name:'Glassline Gallery',canonical_visual_context:{}}],error:null},
    together_character_world_presence:{data:[],error:null},
    together_character_templates:{data:[{id:'character-1',name:'Brooke',slug:'brooke',published:true,can_be_selected:true,current_published_version:1,together_character_versions:[{id:'version-1',version:1,appearance_config:{},appearance_candidates:[],visual_identity:{referenceStoragePaths:[]}}]}],error:null},
    together_entitlements:{data:null,error:null},
    together_notification_preferences:{data:null,error:null},
  };
  return{
    queried,
    db:{
      from(table:string){
        queried.push(table);
        const result=results[table];if(!result)throw new Error(`Pre-onboarding snapshot should not query ${table}`);
        const query={
          select(){return query;},eq(){return query;},neq(){return query;},order(){return query;},
          async maybeSingle(){return result;},
          then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown){return Promise.resolve(result).then(resolve,reject);},
        };
        return query;
      },
      storage:{from(){throw new Error('No portrait storage request is expected without reference paths.');}},
    },
  };
}

Deno.test('newly created accounts receive a companion-selection snapshot before a profile exists',async()=>{
  const{db,queried}=onboardingDb();
  const snapshot=await buildSnapshot(db as never,'new-user') as Record<string,any>;
  assert(snapshot.profile===null,'the pre-onboarding profile should remain null');
  assert(snapshot.discoverableCharacters.length===1,'selectable companions should be available');
  assert(snapshot.discoverableCharacters[0].slug==='brooke','the selectable companion should be hydrated');
  assert(snapshot.characters.length===0&&snapshot.conversations.length===0,'relationship state should start empty');
  assert(!queried.includes('together_continuities'),'the snapshot must not require a continuity before onboarding');
});
