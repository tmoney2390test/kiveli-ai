import { decorateSnapshotSharedPlan } from './together.ts';

function assert(condition:unknown,message:string){if(!condition)throw new Error(message);}

Deno.test('snapshot plans retain active user and character attendance',()=>{
  const plan=decorateSnapshotSharedPlan({
    id:'plan-1',
    character_instance_id:'character-1',
    status:'active',
    together_plan_attendance:[
      {id:'character-attendance',participant_type:'character',character_instance_id:'character-1',joined_at:'2026-08-22T12:00:00.000Z',left_at:null},
      {id:'user-attendance',participant_type:'user',character_instance_id:null,joined_at:'2026-08-22T12:01:00.000Z',left_at:null},
    ],
  });
  assert(plan.attendance.user?.id==='user-attendance','user attendance should be exposed on the canonical plan shape');
  assert(plan.attendance.character?.id==='character-attendance','character attendance should be exposed on the canonical plan shape');
  assert(!('together_plan_attendance'in plan),'the transport-only relation should not leak into the client plan');
});

Deno.test('snapshot plans preserve ended attendance without treating it as active',()=>{
  const plan=decorateSnapshotSharedPlan({
    id:'plan-2',
    character_instance_id:'character-2',
    status:'active',
    together_plan_attendance:[
      {id:'user-attendance',participant_type:'user',joined_at:'2026-08-22T12:01:00.000Z',left_at:'2026-08-22T12:30:00.000Z'},
    ],
  });
  assert(plan.attendance.user?.left_at==='2026-08-22T12:30:00.000Z','ended attendance should remain available for lifecycle decisions');
  assert(plan.attendance.character===null,'missing character attendance should stay null');
});
