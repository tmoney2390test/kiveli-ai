// Scenario model, not billing logic. USD, 30-day months. No customer data.
import fs from 'node:fs';
const plans={free:{monthly:0,annual:0,credits:0,included:0,infra:.25},plus:{monthly:19.99,annual:199.99,credits:500,included:30,infra:.5},max:{monthly:39.99,annual:399.99,credits:1200,included:90,infra:1}};
// Chat rates include an unmeasured allowance for analysis/memory/retries.
const rates={base:{sfw:.002,adult:.006,photo:.075,essential:.025,immersive:.135,note:.006,video:.60,premium:.90,date:.10,background:.25},stress:{sfw:.004,adult:.014,photo:.15,essential:.05,immersive:.17,note:.012,video:1.2,premium:1.8,date:.2,background:.75}};
// Columns: name, plan, replies/day, adult fraction, daily-benefit photos used/month,
// paid photos, Essential min, Immersive min, short notes, Standard 10s videos,
// Premium 10s videos, included date photos. Media credits never counted twice.
const profiles=[
 ['Free casual','free',5,0,0,0,0,0,0,0,0,0],
 ['Free daily limit','free',20,0,0,0,0,0,0,0,0,0],
 ['Plus light','plus',10,.25,5,5,5,0,5,0,0,0],
 ['Plus mixed','plus',30,.5,20,10,20,20,20,1,0,1],
 ['Plus chat-heavy','plus',100,.5,0,0,0,0,0,0,0,0],
 ['Plus photo-heavy','plus',10,.5,30,50,0,0,0,0,0,1],
 ['Max mixed','max',60,.5,45,30,40,40,30,2,0,3],
 ['Max heavy mixed','max',100,.75,90,30,30,60,20,2,0,3],
 ['Max photo-heavy','max',10,.5,90,120,0,0,0,0,0,3],
 ['Max Immersive-heavy','max',30,.5,90,0,0,150,0,0,0,3],
 ['Max Premium-video-heavy','max',30,.5,45,0,0,0,0,0,6,3],
 ['Max extreme adult chat','max',300,1,0,0,0,0,0,0,0,0],
];
const beforeProfiles=profiles.map(row=>[...row]);
for(const row of profiles){const p=plans[row[1]],other=row[5]*10+row[6]*5+row[8]*2+row[9]*130+row[10]*200;row[7]=Math.min(row[7],Math.max(0,Math.floor((p.credits-other)/20)));}
const rows=profiles.map(([name,plan,daily,adult,included,photos,essential,immersive,notes,videos,premium,dates])=>{
 const p=plans[plan],credits=photos*10+essential*5+immersive*20+notes*2+videos*130+premium*200;
 if(credits>p.credits||included>p.included)throw Error(name+' exceeds recurring allowance');
 const cost=r=>daily*30*((1-adult)*r.sfw+adult*r.adult)+(included+photos)*r.photo+essential*r.essential+immersive*r.immersive+notes*r.note+videos*r.video+premium*r.premium+dates*r.date+r.background+p.infra;
 const base=cost(rates.base),stress=cost(rates.stress);
 return{name,plan,daily,adult,included,photos,essential,immersive,notes,videos,premium,dates,credits,base,stress,monthly30:p.monthly*.7-base,annual30:p.annual/12*.7-base,monthly15:p.monthly*.85-base,annual15:p.annual/12*.85-base};
});
const packs=[[4.99,250],[11.99,700],[27.99,1750],[59.99,4500]].map(([price,credits])=>({price,credits,photoPrice:price/credits*10,netPerCredit30:price/credits*.7,netPerCredit15:price/credits*.85,immersive:[8,12,16,20].map(rate=>({rate,retailMinute:rate*price/credits,netMinute30:rate*price/credits*.7,netMinute15:rate*price/credits*.85,margin30:1-rates.base.immersive/(rate*price/credits*.7)}))}));
const result={date:'2026-09-15',status:'NSFW route and 5/20 voice rates deployed; revised credit packs are proposed, not live',plans,rates,rows,packs,beforeProfiles,voiceCreditsPerMinute:{essential:5,immersive:20},excluded:['unverified fixed infrastructure invoices','staff/support','taxes','refunds/chargebacks','RevenueCat fees','customer acquisition','unused-credit future redemption liability']};
fs.writeFileSync('docs/subscription-cost-analysis-2026-09-15.json',JSON.stringify(result,null,2)+'\n');
console.table(rows.map(r=>({profile:r.name,credits:r.credits,cost:r.base.toFixed(2),stress:r.stress.toFixed(2),monthly30:r.monthly30.toFixed(2),annual30:r.annual30.toFixed(2),monthly15:r.monthly15.toFixed(2)})));
