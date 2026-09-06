import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const reasons=['minor_safety','nonconsensual_or_exploitative','real_person_privacy','threat_or_harm','harassment','unexpected_sexual_content','other'] as const;
const legacyReasons=['unsafe','sexual_content','self_harm','impersonation','privacy'] as const;
const schema = z.object({ messageId: z.string().uuid().optional(), reason: z.enum([...reasons,...legacyReasons]), detail: z.string().trim().max(1000).default('') });

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  await enforceRateLimit(db, user.id, 'together_report', 15, 86400);
  const input = await parseBody(request, schema);
  if (input.messageId) {
    const { data } = await db.from('together_messages').select('id').eq('id', input.messageId).eq('user_id', user.id).maybeSingle();
    if (!data) throw new AppError('NOT_FOUND', 'That response is no longer available.', 404);
  }
  const reason=normalizeReason(input.reason),urgent=reason==='minor_safety'||reason==='nonconsensual_or_exploitative',severe=urgent||reason==='real_person_privacy'||reason==='threat_or_harm',severity=urgent?'urgent':severe?'high':'normal';
  if(input.messageId){const{data:existing}=await db.from('together_safety_reports').select('id').eq('user_id',user.id).eq('message_id',input.messageId).eq('reason',reason).in('status',['open','reviewing']).maybeSingle();if(existing)return json({data:{reportId:existing.id,duplicate:true},correlationId},200,correlationId);}
  const { data, error } = await db.from('together_safety_reports').insert({ user_id: user.id, message_id: input.messageId ?? null, reason, detail: input.detail, severity,status:'open' }).select('id').single();
  if (error) throw new AppError('INTERNAL_ERROR', 'Could not submit your report.', 500, true);
  if(severe)await db.from('together_safety_events').insert({user_id:user.id,direction:'system',categories:[`report/${reason}`],action:'account_review',metadata:{reportId:data.id,messageId:input.messageId??null}});
  await db.from('together_safety_report_events').insert({report_id:data.id,actor_user_id:user.id,actor_role:'reporter',event_type:'created',to_status:'open'});
  if(urgent)await db.rpc('kivelle_ops_upsert_incident',{p_dedupe_key:`safety-report:${data.id}`,p_source:'safety_report',p_severity:'critical',p_title:'Urgent private safety report needs review',p_summary_safe:'An urgent safety report entered the protected reviewer queue.',p_correlation_id:correlationId,p_metadata:{reportId:data.id,reason}});
  await track(db, user.id, 'safety_report_submitted', { reportId: data.id, reason, severe });
  return json({ data: { reportId: data.id }, correlationId }, 201, correlationId);
});

function normalizeReason(value:string):typeof reasons[number]{if(value==='sexual_content')return'unexpected_sexual_content';if(value==='self_harm'||value==='unsafe')return'threat_or_harm';if(value==='impersonation'||value==='privacy')return'real_person_privacy';return reasons.includes(value as typeof reasons[number])?value as typeof reasons[number]:'other';}
