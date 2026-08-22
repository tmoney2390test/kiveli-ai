import{derivePhotoOfferContext}from'./together-photo-offer-context.ts';

function assertEquals(actual:unknown,expected:unknown,message:string){if(actual!==expected)throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);}

const now=new Date('2026-08-21T16:00:00.000Z');
const instance={id:'character-1',current_location_id:'home-location',current_activity:'Reading at home',current_mood:'playful',current_presence_source:'character_state',together_character_templates:{name:'Brooke Hart',slug:'brooke-hart'}};

Deno.test('a current co-present scene wins without loading the full dialogue context',()=>{
  const context=derivePhotoOfferContext({instance,conversation:{metadata:{activeScene:{interactionMode:'co_present',characterInstanceId:'character-1',locationId:'cafe-location',entryReason:'user_drop_in',enteredAt:'2026-08-21T15:30:00.000Z',activityKey:'coffee_date',activityLabel:'Having coffee together',sceneSessionId:'scene-1',source:'presence'}}},now});
  assertEquals(context.resolutionSource,'active_scene','context source');
  assertEquals(context.currentScene.locationId,'cafe-location','scene location');
  assertEquals(context.currentScene.activity,'Having coffee together','scene activity');
  assertEquals(context.currentScene.sceneSessionId,'scene-1','scene session');
});

Deno.test('an expired scene falls back to persisted character state',()=>{
  const context=derivePhotoOfferContext({instance,conversation:{metadata:{activeScene:{interactionMode:'co_present',characterInstanceId:'character-1',locationId:'old-location',entryReason:'user_drop_in',enteredAt:'2026-08-21T10:00:00.000Z',source:'presence'}}},now});
  assertEquals(context.resolutionSource,'character_state','context source');
  assertEquals(context.currentScene.locationId,'home-location','character location');
  assertEquals(context.currentScene.activity,'Reading at home','character activity');
});

Deno.test('a shared plan retains its canonical plan id for accepted media',()=>{
  const context=derivePhotoOfferContext({instance,conversation:{metadata:{activeScene:{interactionMode:'co_present',characterInstanceId:'character-1',locationId:'bookstore',entryReason:'shared_plan',sourceEventId:'plan-1',enteredAt:'2026-08-21T15:45:00.000Z',validUntil:'2026-08-21T17:00:00.000Z',source:'presence'}}},now});
  assertEquals(context.currentScene.sharedPlanId,'plan-1','shared plan');
});

Deno.test('a scene belonging to another companion is never reused',()=>{
  const context=derivePhotoOfferContext({instance,conversation:{metadata:{activeScene:{interactionMode:'co_present',characterInstanceId:'character-2',locationId:'wrong-world',entryReason:'user_drop_in',enteredAt:'2026-08-21T15:55:00.000Z',source:'presence'}}},now});
  assertEquals(context.resolutionSource,'character_state','context source');
  assertEquals(context.currentScene.locationId,'home-location','character location');
});
