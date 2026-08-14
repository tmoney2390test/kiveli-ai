import { z } from 'zod';
import { authenticated, enforceRateLimit } from '../_shared/context.ts';
import { parseBody } from '../_shared/body.ts';
import { json, serve } from '../_shared/http.ts';
import { AppError } from '../_shared/types.ts';
import { track } from '../_shared/together.ts';

const goals = z.enum(['Dating', 'Friendship', 'Stories', 'Social worlds']);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile'), displayName: z.string().trim().min(1).max(50), aboutMe: z.string().trim().max(280), interests: z.array(z.string().trim().min(1).max(40)).max(10), goals: z.array(goals).max(4), avatarPath: z.string().max(500).nullable() }),
  z.object({ action: z.literal('privacy'), settings: z.record(z.string(), z.boolean()) }),
  z.object({ action: z.literal('export') }),
  z.object({ action: z.literal('delete'), confirmation: z.literal('DELETE') }),
]);

const exportTables = ['together_profiles', 'together_character_instances', 'together_relationship_states', 'together_relationship_milestones', 'together_conversations', 'together_messages', 'together_memories', 'together_open_threads', 'together_life_events', 'together_date_sessions', 'together_date_choices', 'together_moments', 'together_story_arc_instances', 'together_knowledge_transfers', 'together_generated_media', 'together_content_usage', 'together_notification_preferences', 'together_entitlements'] as const;

serve(async (request, correlationId) => {
  const { user, db } = await authenticated(request);
  const input = await parseBody(request, schema);
  await enforceRateLimit(db, user.id, `together_account_${input.action}`, input.action === 'export' ? 4 : 20, 3600);

  if (input.action === 'profile') {
    const { data, error } = await db.from('together_profiles').update({ display_name: input.displayName, about_me: input.aboutMe, interests: input.interests, experience_goals: input.goals, avatar_path: input.avatarPath, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('*').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save your profile.', 500, true);
    await track(db, user.id, 'account_profile_updated');
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'privacy') {
    const { data, error } = await db.from('together_profiles').update({ privacy_settings: input.settings, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('privacy_settings').single();
    if (error || !data) throw new AppError('INTERNAL_ERROR', 'Could not save privacy settings.', 500, true);
    return json({ data, correlationId }, 200, correlationId);
  }

  if (input.action === 'export') {
    const results = await Promise.all(exportTables.map(async (table) => ({ table, result: await db.from(table).select('*').eq('user_id', user.id) })));
    const failed = results.find(({ result }) => result.error);
    if (failed?.result.error) throw new AppError('INTERNAL_ERROR', 'Your data export could not be prepared.', 500, true);
    const data = Object.fromEntries(results.map(({ table, result }) => [table, result.data ?? []]));
    await track(db, user.id, 'account_data_exported');
    return json({ data: { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email ?? null }, data }, correlationId }, 200, correlationId);
  }

  const { data: media } = await db.storage.from('together-user-media').list(user.id, { limit: 1000 });
  if (media?.length) await db.storage.from('together-user-media').remove(media.map((item) => `${user.id}/${item.name}`));
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw new AppError('INTERNAL_ERROR', 'Your account could not be deleted. Please try again.', 500, true);
  return json({ data: { deleted: true }, correlationId }, 200, correlationId);
});
