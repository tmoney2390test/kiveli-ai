import type { adminClient } from './context.ts';
import { AppError } from './types.ts';
type Db = ReturnType<typeof adminClient>;
export async function supportInbox(
  db: Db,
  userId: string,
  input: { filter?: string; search?: string; beforeAt?: string; beforeId?: string },
) {
  const result = await db.rpc('kivelli_support_inbox', {
    p_user_id: userId,
    p_filter: input.filter ?? 'all',
    p_search: input.search ?? '',
    p_before_at: input.beforeAt ?? null,
    p_before_id: input.beforeId ?? null,
  });
  if (result.error) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Support requests could not be loaded. Try again.',
      500,
      true,
    );
  }
  const rows = result.data.tickets as Array<{ id: string; created_at: string }>;
  const tickets = rows.slice(0, 30), last = tickets.at(-1);
  return {
    tickets,
    counts: result.data.counts,
    nextCursor: rows.length > 30 && last ? { beforeAt: last.created_at, beforeId: last.id } : null,
  };
}
export async function supportUnread(db: Db, userId: string) {
  const { data, error } = await db.rpc('kivelli_support_unread', { p_user_id: userId });
  if (error) {
    throw new AppError('INTERNAL_ERROR', 'Support updates could not be loaded.', 500, true);
  }
  return data;
}
