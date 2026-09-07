import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextPreference } from '../../../packages/together-domain/src/chat-context.ts';

export type ContextReplyQuote = { speakerId:string; provider:string; model:string; inputTokens:number; maxOutputTokens:number; maximumCredits:number; paidExpansion:boolean };
export type ContextReservation = { quoteId:string; requestId:string; userId:string; conversationId:string; preference:ContextPreference; ceiling:number; maximumReplies:number; replies:ContextReplyQuote[]; usedReplies:Set<string>; };
const reservations=new WeakMap<SupabaseClient,ContextReservation>();
export function contextReservation(db:SupabaseClient|undefined):ContextReservation|undefined{return db?reservations.get(db):undefined;}
export function setContextReservation(db:SupabaseClient,value:ContextReservation):void{reservations.set(db,value);}
