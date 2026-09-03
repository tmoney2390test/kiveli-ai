import { assertEquals } from 'jsr:@std/assert';
import { safeAnalyticsProperties } from './together.ts';

Deno.test('analytics strips conversation, prompt, private asset, and encoded image data',()=>{
  const safe=safeAnalyticsProperties({
    mediaId:'media-1',
    provider:'venice',
    prompt:'private direction',
    messageContent:'private exchange',
    signedUrl:'https://private.example.test/object?token=secret',
    nested:{caption:'private caption',status:'ready'},
    bytes:'A'.repeat(300),
    reasonCodes:['quality_ok','policy_ok'],
  });
  assertEquals(safe,{
    mediaId:'media-1',
    provider:'venice',
    nested:{status:'ready'},
    reasonCodes:['quality_ok','policy_ok'],
  });
});

Deno.test('analytics keeps bounded operational metadata only',()=>{
  const safe=safeAnalyticsProperties({attempt:2,success:true,model:'model-a',long:'x'.repeat(300)});
  assertEquals(safe,{attempt:2,success:true,model:'model-a'});
});
