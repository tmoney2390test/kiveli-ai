import { assertEquals } from 'jsr:@std/assert';
import { requestedOfferShotType } from './together-media-offers.ts';

Deno.test('an explicit selfie wins over a location portrait offer, including at acceptance',()=>{
  assertEquals(requestedOfferShotType('user_request','portrait','Send me a spicy selfie at the market'),'selfie');
  assertEquals(requestedOfferShotType('user_request','portrait','Send me a portrait at the market'),'portrait');
  assertEquals(requestedOfferShotType('user_request',undefined,'Send me a selfie'),'selfie');
  assertEquals(requestedOfferShotType('date','scene','A selfie together'),'scene');
});
