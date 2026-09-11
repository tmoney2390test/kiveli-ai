/** A private companion's routine hold; plans and scenes remain separate overlays. */
export type SchedulePause = {
  version: 1;
  pausedAt: string;
  locationId: string | null;
  activity: string;
  activityKey: string;
  interruptibility: 'open' | 'limited' | 'busy' | 'unavailable';
  state: 'active' | 'working' | 'relaxing' | 'sleeping' | 'traveling' | 'busy';
};

export function schedulePauseFrom(value: unknown): SchedulePause | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row['version'] !== 1 || typeof row['pausedAt'] !== 'string' || !Number.isFinite(Date.parse(row['pausedAt'])) ||
    !(row['locationId'] === null || typeof row['locationId'] === 'string') ||
    typeof row['activity'] !== 'string' || typeof row['activityKey'] !== 'string' ||
    typeof row['interruptibility'] !== 'string' || !['open','limited','busy','unavailable'].includes(row['interruptibility']) ||
    typeof row['state'] !== 'string' || !['active','working','relaxing','sleeping','traveling','busy'].includes(row['state'])) return null;
  return row as SchedulePause;
}

export function pausedCharacterState<T extends { schedule_pause?: unknown }>(instance: T): T {
  const pause = schedulePauseFrom(instance.schedule_pause);
  return pause ? { ...instance, current_location_id: pause.locationId, current_activity: pause.activity,
    current_interruptibility: pause.interruptibility, current_presence_source: 'fallback', current_schedule_event_id: null } : instance;
}

/** Scheduled commitments are intentional; generated routines are not. */
export function scheduleEventAllowedDuringPause(event: { source?: unknown; metadata?: unknown }): boolean {
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata as Record<string, unknown> : {};
  return event.source === 'user_plan' || (event.source === 'date' && Boolean(metadata['dateSessionId']));
}

export function schedulePauseConfirmation(paused: boolean, name: string) {
  return paused ? {
    title: 'Resume schedule?', confirmLabel: 'Resume schedule', confirmation: 'resume_schedule' as const,
    message: `${name} will follow the current time of day again. Missed routine events will not be replayed. Your plans and conversation stay intact.`,
  } : {
    title: 'Pause schedule?', confirmLabel: 'Pause schedule', confirmation: 'pause_schedule' as const,
    message: `${name}'s routine will stay in place until you resume it. Plans and scenes can still happen. This applies only to this companion in your current Life.`,
  };
}
