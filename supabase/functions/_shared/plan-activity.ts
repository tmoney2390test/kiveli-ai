import { initializePlanActivityState, loadPlanExperience } from './together-plan-experience.ts';
import { AppError } from './types.ts';

export async function changePlanActivity(db: any, input: { userId: string; continuityId: string; planId: string; conversationId: string; activity: string; requestId: string }) {
  const activity = input.activity.replace(/\s+/g, ' ').trim();
  if (!activity || activity.length > 120) throw new AppError('VALIDATION_FAILED', 'Enter an activity of up to 120 characters.', 400);
  const { data, error } = await db.rpc('kivelli_change_plan_activity', {
    p_user_id: input.userId, p_continuity_id: input.continuityId, p_plan_id: input.planId,
    p_conversation_id: input.conversationId, p_activity: activity, p_request_id: input.requestId,
    p_activity_state: initializePlanActivityState(activity),
  });
  if (error) {
    if (/PLAN_NOT_FOUND|PLAN_CONVERSATION_MISMATCH/.test(error.message)) throw new AppError('NOT_FOUND', 'That plan is not available in this chat.', 404);
    if (/PLAN_NOT_ACTIVE/.test(error.message)) throw new AppError('CONFLICT', 'That plan is no longer active. Open the current plan and try again.', 409);
    if (/ACTIVITY_REQUEST_REUSED/.test(error.message)) throw new AppError('CONFLICT', 'The activity changed. Close this menu and try again.', 409);
    throw new AppError('INTERNAL_ERROR', 'The activity could not be changed. Try again.', 503, true);
  }
  return loadPlanExperience({ db, userId: input.userId, continuityId: input.continuityId, planId: input.planId, characterInstanceId: String(data) });
}
