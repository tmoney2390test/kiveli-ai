import { assertEquals, assert, assertRejects } from 'jsr:@std/assert@1';
import { parseWaveSpeedPrice } from './wavespeed.ts';
import { newVideoSettings, publishedVideoCreditCost } from './kivelle-video-prices.ts';
import { configuredVideoRouteCatalog } from './kivelle-video-routes.ts';
import { consumerVideoCreditQuotes } from '../../../packages/together-domain/src/video-consumer.ts';

Deno.test('pricing uses payable discounts, preserves list and accepts free quotes',()=>{
 assertEquals(parseWaveSpeedPrice({data:{price:.4,discounted_price:.2,discount_rate:50}}),{amountUsd:.2,listPriceUsd:.4,discountRate:50});
 assertEquals(parseWaveSpeedPrice({data:{price:.4,discounted_price:0}}).amountUsd,0);
 assertEquals(parseWaveSpeedPrice({data:{price:.4}}).amountUsd,.4);
 assert(Number.isNaN(parseWaveSpeedPrice({data:{price:.4,discounted_price:null}}).amountUsd));
 assert(Number.isNaN(parseWaveSpeedPrice({data:{price:.4,discounted_price:-1}}).amountUsd));
});
Deno.test('Cinematic includes audio and Standard preserves the saving choice',()=>{
 const catalog=configuredVideoRouteCatalog();
 const settings={resolution:'480p' as const,duration:5,sound:false};
 assertEquals(newVideoSettings(catalog.find(r=>r.id==='minimax-h3-sfw')!,settings).sound,true);
 assertEquals(newVideoSettings(catalog.find(r=>r.id==='seedance-1-5-pro-sfw')!,settings).sound,false);
 const standard=consumerVideoCreditQuotes('tier:standard'),premium=consumerVideoCreditQuotes('tier:premium');
 assert(Number(standard['720p:5:silent'])<Number(standard['720p:5:sound']));
 assertEquals(premium['768p:5:sound'],premium['768p:5:silent']);
});
Deno.test('stale displayed credit totals never reach reservation',async()=>{
 const db={from:()=>({select:()=>({order:()=>({limit:()=>({single:async()=>({data:{id:2,credits_per_unit:300,minimum_credits:25},error:null})})})})})} as never;
 const route=configuredVideoRouteCatalog().find(r=>r.id==='seedance-1-5-pro-sfw')!;
 const settings={resolution:'720p' as const,duration:5,sound:false};
 await assertRejects(()=>publishedVideoCreditCost(db,route,settings,33));
 await assertRejects(()=>publishedVideoCreditCost(db,route,settings));
 assertEquals(await publishedVideoCreditCost(db,route,settings,39),39);
});
