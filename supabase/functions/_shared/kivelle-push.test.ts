import{assertEquals}from'jsr:@std/assert@1';
import{neutralCompanionPushPayload,pushProviderErrorDisposition}from'./kivelle-push.ts';

Deno.test('push errors separate device failures from provider incidents',()=>{
  assertEquals(pushProviderErrorDisposition('DeviceNotRegistered'),'deactivate_device');
  assertEquals(pushProviderErrorDisposition('InvalidCredentials'),'provider_incident');
  assertEquals(pushProviderErrorDisposition('MessageTooBig'),'retry');
});

Deno.test('push copy is discreet and payload is versioned',()=>{
  const payload=neutralCompanionPushPayload({to:'token',characterName:'Naomi',route:'/chat?id=1',proactiveMessageId:'id'});
  assertEquals(payload.body,'You have a new message from Naomi.');
  assertEquals(payload.data.version,1);
  assertEquals(JSON.stringify(payload).includes('prompt'),false);
});

Deno.test('push payload includes only validated navigation identifiers',()=>{
  const valid='62a7855d-f1d8-4ddd-8d23-bffa34782db3';
  const payload=neutralCompanionPushPayload({to:'token',characterName:'Naomi',route:`/chat?conversation=${valid}&groupId=not-an-id`,proactiveMessageId:'id'});
  assertEquals(payload.data.conversationId,valid);
  assertEquals('groupId' in payload.data,false);
});
