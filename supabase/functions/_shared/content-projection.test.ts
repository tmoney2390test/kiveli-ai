import{assertEquals}from'jsr:@std/assert@1';
import{projectConversationRows,safeSearchRows}from'./content-projection.ts';

Deno.test('native projection collapses restricted text and attachment metadata into one neutral event',()=>{
  const rows=[
    {id:'safe-1',conversation_id:'conversation',role:'user',content:'Hello',content_rating:'safe',visibility_scope:'all'},
    {id:'adult-1',conversation_id:'conversation',role:'assistant',content:'restricted dialogue',content_rating:'explicit',visibility_scope:'web_adult',safe_bridge:'You and your companion shared a more intimate moment and grew closer.',together_conversation_attachments:[{storage_path:'private/adult.webp',signed_url:'https://private.test/adult',prompt:'restricted prompt',caption:'restricted caption'}]},
    {id:'adult-2',conversation_id:'conversation',role:'user',content:'more restricted dialogue',content_rating:null,visibility_scope:'web_adult'},
    {id:'safe-2',conversation_id:'conversation',role:'assistant',content:'Welcome back',content_rating:'suggestive',visibility_scope:'all'},
  ];
  const projected=projectConversationRows(rows,false,'Naomi'),serialized=JSON.stringify(projected);
  assertEquals(projected.map((row)=>row.id),['safe-1','bridge-adult-1-adult-2','safe-2']);
  assertEquals(serialized.includes('restricted dialogue')||serialized.includes('adult.webp')||serialized.includes('restricted prompt')||serialized.includes('restricted caption')||serialized.includes('private.test'),false);
  assertEquals(projected[1]?.role,'system');
});

Deno.test('safe search fails closed for unknown rows and never returns restricted text',()=>{
  const rows=[{id:'unknown',content:'uncertain'},{id:'safe',content:'ordinary',content_rating:'safe',visibility_scope:'all'},{id:'adult',content:'restricted',content_rating:'explicit',visibility_scope:'web_adult'}];
  assertEquals(safeSearchRows(rows,false).map((row)=>row.id),['safe']);
  assertEquals(safeSearchRows(rows,true).length,3);
});

Deno.test('private adult text projection admits only server-policy-marked explicit text',()=>{
  const trusted={id:'trusted',role:'assistant',content:'private',content_rating:'explicit',visibility_scope:'all',moderation_version:'private-adult-text-v1',provider_metadata:{contentPolicyVersion:'private-adult-text-v1',privacyScope:'private',adultEligibilityApplied:true,allParticipantsAdults:true,safetyDisposition:'allowed'}};
  const forged={...trusted,id:'forged',provider_metadata:{...trusted.provider_metadata,adultEligibilityApplied:false}};
  const quoting={id:'safe-quote',content:'reply',content_rating:'safe',visibility_scope:'all',reply_to_message:trusted};
  const visible=safeSearchRows([trusted,forged,quoting],{authorizedWebAdult:false,authorizedPrivateAdultText:true});
  assertEquals(visible.map((row)=>row.id),['trusted','safe-quote']);
  assertEquals((visible[1]?.reply_to_message as {id?:string}|undefined)?.id,'trusted');
  assertEquals(projectConversationRows([trusted,forged],{authorizedWebAdult:false,authorizedPrivateAdultText:true}).map((row)=>row.id),['trusted','bridge-forged-forged']);
});
