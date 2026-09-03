import { supabasePublishableKey,supabaseUrl } from './supabase';

let preparedToken='';
let preparedAt=0;
let preparation:Promise<WebAdultSessionStatus>|null=null;
let preparationVersion=0;

const SESSION_PREPARATION_TIMEOUT_MS=8_000;

export type WebAdultSessionStatus={prepared:boolean;authorized:boolean;adultEligible?:boolean;premiumAccess?:boolean;available?:boolean};

export function ensureWebAdultSession(accessToken:string,options:{force?:boolean}={}):Promise<WebAdultSessionStatus>{
  if(!accessToken)return Promise.resolve({prepared:false,authorized:false});
  const sameToken=preparedToken===accessToken;
  if(sameToken&&preparation&&preparedAt===0&&!options.force)return preparation;
  if(sameToken&&preparation&&!options.force&&Date.now()-preparedAt<120_000)return preparation;
  const version=++preparationVersion;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),SESSION_PREPARATION_TIMEOUT_MS);
  preparedToken=accessToken;
  preparedAt=0;
  preparation=fetch(`${supabaseUrl}/functions/v1/together-adult-mode`,{
    method:'POST',
    credentials:'same-origin',
    signal:controller.signal,
    headers:{Authorization:`Bearer ${accessToken}`,apikey:supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({action:'status'}),
  }).then(async(response)=>{
    const payload=await response.json().catch(()=>({})) as{data?:{authorized?:boolean;adult_eligible?:boolean;premium_access?:boolean;available?:boolean}};
    if(!response.ok)throw new Error('WEBSITE_SESSION_PREPARATION_FAILED');
    if(version===preparationVersion)preparedAt=Date.now();
    return{prepared:true,authorized:payload.data?.authorized===true,adultEligible:payload.data?.adult_eligible===true,premiumAccess:payload.data?.premium_access===true,available:payload.data?.available===true};
  }).catch((error)=>{if(version===preparationVersion){preparedToken='';preparedAt=0;preparation=null;}throw error;})
    .finally(()=>clearTimeout(timeout));
  return preparation;
}
