import { z } from 'zod';
import { authenticated } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { buildSnapshot } from '../_shared/together.ts';
import { runLifeSimulation } from '../_shared/together-life.ts';
import { buildKivelleConversationContext } from '../_shared/kivelle-conversation-context.ts';
import { summarizeAiUsage } from '../../../packages/together-domain/src/ai-usage.ts';

const schema = z.object({ action: z.enum(['inspect','inspect_context','inspect_media','inspect_ai_usage','inspect_media_economics','adjust_relationship','content_inspect','simulate_content']), characterInstanceId: z.string().uuid().optional(), mediaId:z.string().uuid().optional(), message:z.string().max(4000).optional(), changes: z.record(z.string(), z.number()).optional(), days: z.number().int().min(1).max(30).optional() });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const allowed = (Deno.env.get('TOGETHER_DEBUG_USER_IDS') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!allowed.includes(user.id) && user.app_metadata?.together_internal !== true) throw new AppError('FORBIDDEN', 'Internal build access is required.', 403);
  const input = await parseBody(request, schema);
  if(input.action==='inspect_ai_usage'){
    const since=new Date(Date.now()-30*86400000).toISOString();
    let query=db.from('together_ai_usage_events').select('correlation_id,provider,model,operation,route_reason,content_mode,subscription_tier,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,total_tokens,estimated_cost_usd,provider_cost_usd,provider_cost_ticks,cache_hit,latency_ms,success,http_status,error_code,metadata,created_at').eq('user_id',user.id).gte('created_at',since).order('created_at',{ascending:false}).limit(10000);
    if(input.characterInstanceId)query=query.eq('character_instance_id',input.characterInstanceId);
    const{data,error}=await query;if(error)throw new AppError('INTERNAL_ERROR','AI usage could not be inspected.',500,true);
    return json({data:{summary:summarizeAiUsage(data??[]),latest:(data??[]).slice(0,20),note:'Prompts, messages, memories, credentials, and raw provider payloads are excluded.'},correlationId},200,correlationId);
  }
  if(input.action==='inspect_media_economics'){
    const since=new Date(Date.now()-30*86400000).toISOString();
    const[usage,offers,ledger,accounts]=await Promise.all([
      db.from('together_media_usage_events').select('*').eq('user_id',user.id).gte('created_at',since).order('created_at',{ascending:false}).limit(10000),
      db.from('together_media_offers').select('id,source,status,credit_cost,included_subscription_benefit,created_at,accepted_at,declined_at').eq('user_id',user.id).gte('created_at',since).limit(10000),
      db.from('together_credit_ledger').select('event_type,permanent_delta,subscription_delta,created_at,metadata').eq('user_id',user.id).gte('created_at',since).limit(10000),
      db.from('together_credit_accounts').select('permanent_balance,subscription_balance').eq('user_id',user.id).maybeSingle(),
    ]);
    const failed=[usage,offers,ledger,accounts].find((item)=>item.error);if(failed?.error)throw new AppError('INTERNAL_ERROR','Media economics could not be inspected.',500,true);
    return json({data:{windows:summarizeMediaWindows(usage.data??[],offers.data??[]),creditLiability:summarizeCreditLiability(ledger.data??[],accounts.data),latestAttempts:(usage.data??[]).slice(0,30),note:'Provider cost is marked estimated unless actual_provider_cost_usd is populated. Prompts, private messages, signed URLs, and credentials are excluded.'},correlationId},200,correlationId);
  }
  if(input.action==='inspect_media'){
    if(!input.mediaId)throw new AppError('VALIDATION_FAILED','Choose a media row.',400);
    const mediaResult=await db.from('together_generated_media').select('*').eq('id',input.mediaId).eq('user_id',user.id).maybeSingle();
    if(!mediaResult.data)throw new AppError('NOT_FOUND','That media row is unavailable.',404);
    const media=mediaResult.data,metadata=(media.metadata??{}) as Record<string,unknown>,referenceIds=Array.isArray(metadata.referenceAssets)?metadata.referenceAssets.map((item)=>String((item as Record<string,unknown>).assetId??'')).filter(Boolean):[];
    const instance=await db.from('together_character_instances').select('character_version_id').eq('id',media.character_instance_id).eq('user_id',user.id).maybeSingle();
    const[job,references,profile]=await Promise.all([db.from('together_media_provider_jobs').select('id,job_type,provider,model,route_id,provider_request_id,status,attempt_count,submitted_at,provider_completed_at,finalized_at,next_poll_at,failure_code,failure_reason_safe,provider_metadata,created_at,updated_at').eq('generated_media_id',media.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),referenceIds.length?db.from('together_media_reference_assets').select('id,asset_role,source_key,revision,character_version_id,location_id,world_id').in('id',referenceIds):Promise.resolve({data:[]}),db.from('together_character_media_profiles').select('id,provider,model_family,profile_kind,status,source_revision,compatibility,trained_at,failure_code').eq('character_version_id',instance.data?.character_version_id??'00000000-0000-0000-0000-000000000000').eq('status','ready').order('source_revision',{ascending:false}).limit(1).maybeSingle()]);
    return json({data:{media:{id:media.id,mediaType:media.media_type,status:media.status,requestedContentLevel:metadata.requestedContentLevel,resolvedContentLevel:metadata.resolvedContentLevel,source:metadata.source,shotType:metadata.shotType,characterInstanceId:media.character_instance_id,worldId:media.world_id,locationId:media.location_id,locationReferenceResolution:metadata.locationReferenceResolution,storagePath:media.storage_path,provider:media.provider,providerRequestId:media.provider_request_id,generationMs:media.generation_ms,failureCode:media.failure_code},references:references.data??[],mediaProfile:profile.data??null,providerJob:job.data??null,note:'Prompts, generation intent, signed URLs, credentials, and provider payloads are excluded.'},correlationId},200,correlationId);
  }
  if(input.action==='inspect_context'){
    if(!input.characterInstanceId)throw new AppError('VALIDATION_FAILED','Choose a character.',400);
    const[{data:instance},{data:conversation}]=await Promise.all([db.from('together_character_instances').select('*,together_character_templates(*),together_character_versions(*)').eq('id',input.characterInstanceId).eq('user_id',user.id).maybeSingle(),db.from('together_conversations').select('*').eq('character_instance_id',input.characterInstanceId).eq('user_id',user.id).is('archived_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle()]);
    if(!instance||!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable.',404);
    const lifeRun=await runLifeSimulation({db,userId:user.id,characterInstanceId:instance.id,trigger:'home_opened',evaluateProactive:false});
    const context=await buildKivelleConversationContext({db,userId:user.id,instance,conversation,userMessage:input.message??'What is happening right now?',lifeRun});
    return json({data:{...context,debug:{...context.debug,note:'Credentials, provider secrets, embeddings, and sensitive memories are excluded.'}},correlationId},200,correlationId);
  }
  if (input.action === 'adjust_relationship') {
    if (!input.characterInstanceId || !input.changes) throw new AppError('VALIDATION_FAILED', 'Choose a character and changes.', 400);
    const permitted = ['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'];
    const changes = Object.fromEntries(Object.entries(input.changes).filter(([key]) => permitted.includes(key)).map(([key,value]) => [key, Math.max(0, Math.min(100, Math.round(value)))]));
    const { error } = await db.from('together_relationship_states').update({ ...changes, updated_at: new Date().toISOString() }).eq('character_instance_id', input.characterInstanceId).eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL_ERROR', 'Debug adjustment failed.', 500);
  }
  if (input.action === 'simulate_content') {
    if (!input.characterInstanceId) throw new AppError('VALIDATION_FAILED', 'Choose a character to simulate.', 400);
    const days = input.days ?? 1;
    const { data: instance } = await db.from('together_character_instances').select('last_event_simulated_at,last_simulated_at').eq('id', input.characterInstanceId).eq('user_id', user.id).single();
    let cursor = new Date(instance?.last_event_simulated_at ?? instance?.last_simulated_at ?? new Date().toISOString());
    for (let day = 0; day < days; day++) { cursor = new Date(cursor.getTime() + 24 * 3600000); await runLifeSimulation({ db, userId: user.id, characterInstanceId: input.characterInstanceId, now: cursor, evaluateProactive: false, trigger: 'conversation_continued' }); }
  }
  if (input.action === 'content_inspect') {
    const [templates, arcs, activeArcs, usage] = await Promise.all([
      db.from('together_event_templates').select('id,name,category,tone,scale,content_level,probability,significance,active').eq('active', true).order('category').limit(500),
      db.from('together_story_arc_templates').select('slug,title,priority,chapters,cooldown_days').eq('active', true).order('priority'),
      input.characterInstanceId ? db.from('together_story_arc_instances').select('*').eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).order('updated_at', { ascending: false }) : Promise.resolve({ data: [] }),
      input.characterInstanceId ? db.from('together_content_usage').select('*').eq('user_id', user.id).eq('character_instance_id', input.characterInstanceId).order('used_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    ]);
    return json({ data: { templates: templates.data ?? [], arcs: arcs.data ?? [], activeArcs: activeArcs.data ?? [], recentUsage: usage.data ?? [] }, correlationId }, 200, correlationId);
  }
  const snapshot = await buildSnapshot(db, user.id);
  return json({ data: { ...snapshot, aiContext: { note: 'Structured context preview. Credentials and provider secrets are intentionally excluded.' } }, correlationId }, 200, correlationId);
});

function summarizeMediaWindows(usage:Array<Record<string,any>>,offers:Array<Record<string,any>>){return Object.fromEntries([1,7,30].map((days)=>{const cutoff=Date.now()-days*86400000,attempts=usage.filter((row)=>new Date(row.created_at).getTime()>=cutoff),windowOffers=offers.filter((row)=>new Date(row.created_at).getTime()>=cutoff),cost=(row:Record<string,any>)=>Number(row.actual_provider_cost_usd??row.estimated_provider_cost_usd??0),total=attempts.reduce((sum,row)=>sum+cost(row),0),delivered=new Set(attempts.filter((row)=>row.success===true&&row.generated_media_id).map((row)=>row.generated_media_id)).size,credits=attempts.reduce((sum,row)=>sum+Number(row.credit_funded?row.credit_cost:0),0);return[days===1?'today':`${days}d`,{totalProviderCostUsd:total,costByProvider:groupCost(attempts,'provider',cost),costByModel:groupCost(attempts,'model',cost),costByRoute:groupCost(attempts,'route_id',cost),costByTier:groupCost(attempts,'subscription_tier',cost),costBySource:groupCost(attempts,'source',cost),creditFundedImageCount:new Set(attempts.filter((row)=>row.credit_funded&&row.generated_media_id).map((row)=>row.generated_media_id)).size,includedBenefitImageCount:new Set(attempts.filter((row)=>row.included_subscription_benefit&&row.generated_media_id).map((row)=>row.generated_media_id)).size,unfundedImageCount:new Set(attempts.filter((row)=>!row.credit_funded&&!row.included_subscription_benefit&&row.generated_media_id).map((row)=>row.generated_media_id)).size,averageProviderCostPerDeliveredImage:delivered?total/delivered:0,qualityRetryRate:attempts.length?attempts.filter((row)=>row.quality_retry).length/attempts.length:0,averageRetryCost:average(attempts.filter((row)=>row.quality_retry).map(cost)),creditsSpentOnMedia:credits,providerCogsPer100CreditsSpent:credits?total/credits*100:0,offerStatusCounts:groupCount(windowOffers,'status'),acceptedOfferRate:offerRate(windowOffers,'accepted'),declinedOfferRate:offerRate(windowOffers,'declined'),expiredOfferRate:offerRate(windowOffers,'expired'),dateSouvenirCost:attempts.filter((row)=>row.included_benefit_type==='date_completion_photo').reduce((sum,row)=>sum+cost(row),0),storyOfferAcceptance:sourceOfferRate(windowOffers,'story'),lifeEventOfferAcceptance:sourceOfferRate(windowOffers,'life_event')}];}));}
function summarizeCreditLiability(rows:Array<Record<string,any>>,account:Record<string,any>|null){const delta=(kind:string,field:string)=>rows.filter((row)=>row.event_type===kind).reduce((sum,row)=>sum+Number(row[field]??0),0);return{welcomeAndPurchasedGranted:delta('welcome_grant','permanent_delta')+delta('purchase','permanent_delta'),subscriptionCreditsGranted:delta('subscription_grant','subscription_delta'),permanentCreditsSpent:Math.abs(Math.min(0,delta('spend','permanent_delta'))),subscriptionCreditsSpent:Math.abs(Math.min(0,delta('spend','subscription_delta'))),creditsRefunded:delta('refund','permanent_delta')+delta('refund','subscription_delta'),creditsExpired:0,permanentPurchasedOutstanding:Number(account?.permanent_balance??0),subscriptionCreditsOutstanding:Number(account?.subscription_balance??0),note:'Unused credits are liabilities, not provider cost. The current ledger has no explicit expiry event; creditsExpired remains zero until one is introduced.'};}
function groupCost(rows:Array<Record<string,any>>,key:string,cost:(row:Record<string,any>)=>number){const result:Record<string,number>={};for(const row of rows){const name=String(row[key]??'unknown');result[name]=(result[name]??0)+cost(row);}return result;}
function groupCount(rows:Array<Record<string,any>>,key:string){const result:Record<string,number>={};for(const row of rows){const name=String(row[key]??'unknown');result[name]=(result[name]??0)+1;}return result;}
function offerRate(rows:Array<Record<string,any>>,status:string){return rows.length?rows.filter((row)=>row.status===status).length/rows.length:0;}
function sourceOfferRate(rows:Array<Record<string,any>>,source:string){const selected=rows.filter((row)=>row.source===source);return selected.length?selected.filter((row)=>['accepted','fulfilled'].includes(row.status)).length/selected.length:0;}
function average(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}
