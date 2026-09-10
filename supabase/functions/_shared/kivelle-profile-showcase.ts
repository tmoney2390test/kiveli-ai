import type { SupabaseClient } from '@supabase/supabase-js';
import { profileHighlights, type ProfileHighlight } from '../../../packages/together-domain/src/profile-showcase.ts';
import { AppError } from './types.ts';

// Only opaque references are stored. Media always goes through the existing
// signed library endpoint and its current account/content access checks.
export async function saveProfileHighlights(db: SupabaseClient, userId: string, continuityId: string, requested: ProfileHighlight[]) {
  const { data: life, error } = await db.from('together_continuities').select('id,metadata').eq('id', continuityId).eq('user_id', userId).maybeSingle();
  if (error) throw new AppError('INTERNAL_ERROR', 'Your highlights could not be loaded.', 500, true);
  if (!life) throw new AppError('NOT_FOUND', 'That Life is unavailable.', 404);
  const highlights = profileHighlights(requested);
  const companionIds = highlights.filter(item => item.kind === 'companion').map(item => item.id);
  const mediaIds = highlights.filter(item => item.kind !== 'companion').map(item => item.id);
  const [companions, media] = await Promise.all([
    companionIds.length ? db.from('together_character_instances').select('id').eq('user_id', userId).eq('continuity_id', continuityId).in('id', companionIds) : {data: [], error: null},
    mediaIds.length ? db.from('together_generated_media').select('id,media_type,status,metadata').eq('user_id', userId).eq('continuity_id', continuityId).in('id', mediaIds) : {data: [], error: null},
  ]);
  if (companions.error || media.error) throw new AppError('INTERNAL_ERROR', 'Your highlights could not be checked.', 500, true);
  if (highlights.some(item => item.kind === 'companion'
    ? !companions.data?.some(row => row.id === item.id)
    : !media.data?.some(row => row.id === item.id && row.media_type === item.kind && row.status === 'ready' && row.metadata?.hiddenIntermediate !== true))) {
    throw new AppError('VALIDATION_FAILED', 'Choose available companions, images, or videos from this Life.', 400);
  }
  const metadata = life.metadata ?? {};
  const saved = await db.from('together_continuities').update({metadata: {...metadata, profileHighlights: highlights}, updated_at: new Date().toISOString()}).eq('id', continuityId).eq('user_id', userId).eq('metadata', JSON.stringify(metadata)).select('id').maybeSingle();
  if (saved.error) throw new AppError('INTERNAL_ERROR', 'Your highlights could not be saved.', 500, true);
  if (!saved.data) throw new AppError('CONFLICT', 'This Life changed in another session. Refresh and try again.', 409, true);
  return highlights;
}
