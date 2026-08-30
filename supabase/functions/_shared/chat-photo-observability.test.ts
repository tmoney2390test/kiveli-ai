import{assertEquals}from'jsr:@std/assert@1';
import{chatPhotoByteBucket,chatPhotoEdgeBucket,chatPhotoFailureCode,chatPhotoLatencyBucket,safeChatPhotoTelemetry}from'./chat-photo-observability.ts';
import{AppError}from'./types.ts';

Deno.test('chat photo telemetry uses only coarse safe buckets',()=>{
  assertEquals(chatPhotoLatencyBucket(1_999),'under_2s');
  assertEquals(chatPhotoLatencyBucket(12_000),'10_to_30s');
  assertEquals(chatPhotoByteBucket(3*1024*1024),'2mb_to_5mb');
  assertEquals(chatPhotoEdgeBucket(2048),'1537_to_2048px');
});

Deno.test('chat photo failures expose only application error codes',()=>{
  assertEquals(chatPhotoFailureCode(new AppError('RATE_LIMITED','sensitive provider detail',429)),'RATE_LIMITED');
  assertEquals(chatPhotoFailureCode(new Error('sensitive provider detail')),'PROVIDER_UNAVAILABLE');
});

Deno.test('chat photo telemetry drops content, URLs, and provider request identifiers',()=>{
  assertEquals(safeChatPhotoTelemetry({stage:'vision',latencyBucket:'2_to_5s',signedUrl:'https://private',shortDescription:'sensitive',providerRequestId:'secret'}),{stage:'vision',latencyBucket:'2_to_5s'});
});
