export const MAX_CHAT_DICTATION_MS = 60_000;

export function mergeDictationTranscript(current: string, transcript: string): string {
  const clean = transcript.replace(/\s+/g, ' ').trim();
  if (!clean) return current;
  const existing = current.trimEnd();
  return existing ? `${existing} ${clean}` : clean;
}

export function dictationAudioMetadata(uri: string, web = false): { contentType: string; fileName: string } {
  if (web || /\.webm(?:$|[?#])/i.test(uri)) {
    return { contentType: 'audio/webm', fileName: 'dictation.webm' };
  }
  return { contentType: 'audio/mp4', fileName: 'dictation.m4a' };
}
