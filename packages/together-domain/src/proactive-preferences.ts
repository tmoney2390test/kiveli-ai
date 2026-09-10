export type QuietHours = { start: string; end: string; timezone: string; enabled: boolean };
export type QuietHoursPreferences = {
  quiet_hours_start?: string; quiet_hours_end?: string; timezone?: string; quiet_hours_enabled?: boolean;
  companion_quiet_hours?: Record<string, QuietHours>; life_quiet_hours?: Record<string, QuietHours>;
};

/** Companion overrides follow that person across chats, within their Life. */
export function resolveCompanionQuietHours(preferences: QuietHoursPreferences | null | undefined, characterId: string, lifeId: string): QuietHours {
  return preferences?.companion_quiet_hours?.[characterId] ?? preferences?.life_quiet_hours?.[lifeId] ?? {
    start: (preferences?.quiet_hours_start ?? '23:00').slice(0, 5),
    end: (preferences?.quiet_hours_end ?? '08:00').slice(0, 5),
    timezone: preferences?.timezone ?? 'UTC', enabled: preferences?.quiet_hours_enabled !== false,
  };
}

export const proactiveFrequencyOptions = [
  { value: 'default', label: 'Use account default', detail: 'Follow your account frequency.' },
  { value: 'off', label: 'Off', detail: 'Only conversations you start.' },
  { value: 'occasional', label: 'Quiet', detail: 'An occasional check-in, at least 36 hours apart.' },
  { value: 'natural', label: 'Natural', detail: 'Updates around their life, at least 18 hours apart.' },
  { value: 'frequent', label: 'Frequent', detail: 'More openings and follow-ups, at least 8 hours apart.' },
] as const;
export type ProactiveFrequency = typeof proactiveFrequencyOptions[number]['value'];

export function nextQuietHoursEnd(now: Date, quiet: QuietHours): Date {
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:quiet.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const candidate=new Date(now);
  for(let minute=0;minute<=26*60;minute++){
    const time=formatter.format(candidate),start=quiet.start.slice(0,5),end=quiet.end.slice(0,5);
    const inside=start>end?time>=start||time<end:time>=start&&time<end;
    if(!quiet.enabled||!inside)return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes()+1,0,0);
  }
  throw new Error('Quiet hours have no end.');
}
