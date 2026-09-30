export type MediaProgressStage = 'queued' | 'preparing' | 'generating' | 'finalizing' | 'retrying' | 'ready' | 'failed';

/** Only report stages backed by durable state, never a timer-based percentage. */
export function mediaProgressStage(media: Record<string, any>, job?: Record<string, any>, now = Date.now()): MediaProgressStage {
  if (media.status === 'ready' || media.status === 'failed') return media.status;
  if (media.status === 'queued') return Date.parse(media.next_attempt_at ?? '') > now ? 'retrying' : 'queued';
  if (job && !['failed', 'cancelled'].includes(job.status)) {
    if (job.provider_completed_at || Date.parse(job.finalization_lease_expires_at ?? '') > now) return 'finalizing';
    if (job.status === 'processing' || job.status === 'submitting') return 'generating';
  }
  return 'preparing';
}

/** One owner-scoped query for a whole status batch; provider details stay private. */
export async function withMediaProgress(db: any, userId: string, rows: Array<Record<string, any>>): Promise<Array<Record<string, any>>> {
  const pending = rows.filter(row => row.status === 'queued' || row.status === 'generating');
  const jobs = pending.length ? await db.from('together_media_provider_jobs')
    .select('generated_media_id,status,provider_completed_at,finalization_lease_expires_at,created_at')
    .eq('user_id', userId).in('generated_media_id', pending.map(row => row.id))
    .order('created_at', { ascending: false }) : { data: [] };
  const latest = new Map<string, Record<string, any>>();
  for (const job of jobs.data ?? []) if (!latest.has(job.generated_media_id)) latest.set(job.generated_media_id, job);
  // A diagnostic read must not turn an otherwise recoverable request into an error.
  return rows.map(row => ({ ...row, progress_stage: mediaProgressStage(row, latest.get(row.id)) }));
}
