-- Price the already-compiled reply. This service-only operation must succeed
-- before provider dispatch; it does not relax receipt or wallet constraints.
create or replace function public.kivelle_prepare_context_reply(p_quote_id uuid,p_slot jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare q public.together_context_quotes; a public.together_credit_accounts;
  old_slot jsonb; slots jsonb; cap integer; needed integer; delta integer; s integer; p integer;
begin
 select * into q from public.together_context_quotes where id=p_quote_id for update;
 if q.id is null or q.status<>'reserved' or coalesce(q.manifest->>'automatic','false')<>'true'
   or not exists(select 1 from public.together_dialogue_turns where id=q.turn_id and user_id=q.user_id and conversation_id=q.conversation_id and request_id=q.request_id::text and state in ('planning','generating'))
 then raise exception 'CONTEXT_TURN_INVALID'; end if;
 if coalesce((p_slot->>'maximumCredits')::integer,-1) not between 0 and 1000
   or coalesce((p_slot->>'inputTokens')::integer,-1) not between 1 and (q.manifest->>'ceiling')::integer
   or coalesce((p_slot->>'maxOutputTokens')::integer,-1) not between 1 and 32768
   or not (p_slot ?& array['speakerId','provider','model','inputTokens','maxOutputTokens','maximumCredits','paidExpansion'])
   or not exists(select 1 from public.together_character_instances i join public.together_conversations c on c.id=q.conversation_id where i.id=(p_slot->>'speakerId')::uuid and i.user_id=q.user_id and i.continuity_id=c.continuity_id)
 then raise exception 'CONTEXT_SLOT_INVALID'; end if;
 select value into old_slot from jsonb_array_elements(q.manifest->'replies') where value->>'speakerId'=p_slot->>'speakerId';
 cap=greatest((p_slot->>'maximumCredits')::integer,coalesce((old_slot->>'maximumCredits')::integer,0));
 p_slot=p_slot||jsonb_build_object('maximumCredits',cap);
 select coalesce(jsonb_agg(value),'[]'::jsonb) into slots from jsonb_array_elements(q.manifest->'replies') where value->>'speakerId'<>p_slot->>'speakerId';
 slots=slots||jsonb_build_array(p_slot);
 if jsonb_array_length(slots)>6 or (q.manifest->>'maximumReplies')::integer not between 1 and 6 then raise exception 'CONTEXT_SLOT_INVALID'; end if;
 select greatest(q.maximum_credits,coalesce(max((value->>'maximumCredits')::integer),0)*(q.manifest->>'maximumReplies')::integer) into needed from jsonb_array_elements(slots);
 delta=needed-q.maximum_credits;
 if delta>0 then
   select * into a from public.together_credit_accounts where user_id=q.user_id for update;
   if a.user_id is null or a.permanent_balance+a.subscription_balance<delta then raise exception 'INSUFFICIENT_KIVELLE_CREDITS'; end if;
   if a.subscription_grant_cycle is distinct from q.subscription_grant_cycle or a.subscription_expires_at is distinct from q.subscription_expires_at then raise exception 'CONTEXT_CYCLE_CHANGED'; end if;
   s=least(a.subscription_balance,delta);p=delta-s;
   update public.together_credit_accounts set subscription_balance=subscription_balance-s,permanent_balance=permanent_balance-p,updated_at=now() where user_id=q.user_id;
   -- One hold per turn. Subsequent speaker preparation can increase that hold;
   -- retries at the same bound change neither the wallet nor its ledger entry.
   insert into public.together_credit_ledger(user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
   values(q.user_id,'spend',-p,-s,'context-hold:'||q.id,'context_quote',q.id::text,jsonb_build_object('action','expanded_context','status','reserved','maximumCredits',needed))
   on conflict(user_id,idempotency_key) do update set permanent_delta=together_credit_ledger.permanent_delta+excluded.permanent_delta,subscription_delta=together_credit_ledger.subscription_delta+excluded.subscription_delta,metadata=excluded.metadata;
   q.permanent_held=q.permanent_held+p;q.subscription_held=q.subscription_held+s;
 end if;
 update public.together_context_quotes set manifest=jsonb_set(manifest,'{replies}',slots),maximum_credits=needed,permanent_held=q.permanent_held,subscription_held=q.subscription_held where id=q.id;
end $$;
revoke all on function public.kivelle_prepare_context_reply(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_prepare_context_reply(uuid,jsonb) to service_role;
