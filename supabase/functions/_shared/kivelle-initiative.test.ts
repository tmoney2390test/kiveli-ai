import{assertEquals}from'https://deno.land/std@0.224.0/assert/mod.ts';
import{isPlanReminderProactive}from'./kivelle-initiative.ts';

Deno.test('initiative delivery keeps plan reminders independent',()=>{
  assertEquals(isPlanReminderProactive({dedupe_key:'plan:pre:abc',context:{}}),true);
  assertEquals(isPlanReminderProactive({dedupe_key:'group-plan:pre:abc',context:{groupPlanId:'abc'}}),true);
  assertEquals(isPlanReminderProactive({dedupe_key:'future-format',context:{messageKind:'plan_reminder'}}),true);
  assertEquals(isPlanReminderProactive({dedupe_key:'event:abc',context:{messageKind:'initiative'}}),false);
  assertEquals(isPlanReminderProactive({dedupe_key:'thread:abc',context:{}}),false);
});
