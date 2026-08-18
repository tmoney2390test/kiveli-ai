import{createHmac}from'node:crypto';
import{describe,expect,it}from'vitest';
import{verifyProviderWebhookHmac}from'./provider-webhook.ts';

describe('provider webhook verification',()=>{const now=new Date('2026-08-18T12:00:00Z'),timestamp=String(Math.floor(now.getTime()/1000)),webhookId='msg_123',rawBody='{"data":{"id":"prediction_1","status":"completed"}}',secret='whsec_test-secret',signature=`v3,${createHmac('sha256','test-secret').update(`${webhookId}.${timestamp}.${rawBody}`).digest('hex')}`;
  it('accepts a valid raw-body signature',async()=>expect(await verifyProviderWebhookHmac({rawBody,webhookId,timestamp,signature,secret,now})).toBe(true));
  it('rejects body tampering and stale delivery',async()=>{expect(await verifyProviderWebhookHmac({rawBody:`${rawBody} `,webhookId,timestamp,signature,secret,now})).toBe(false);expect(await verifyProviderWebhookHmac({rawBody,webhookId,timestamp,signature,secret,now:new Date('2026-08-18T12:10:00Z')})).toBe(false);});
  it('rejects malformed signatures without throwing',async()=>expect(await verifyProviderWebhookHmac({rawBody,webhookId,timestamp,signature:'v3,nope',secret,now})).toBe(false));
});
