export function formatVoiceTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function formatVoiceProgress(currentSeconds: number, durationSeconds: number): string {
  return `${formatVoiceTime(currentSeconds)} / ${formatVoiceTime(durationSeconds)}`;
}
