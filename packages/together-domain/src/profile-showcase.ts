export type ProfileHighlight = { kind: 'companion' | 'image' | 'video'; id: string };
export const PROFILE_HIGHLIGHT_LIMIT = 12;

export function profileHighlights(value: unknown): ProfileHighlight[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return (value as unknown[]).filter((candidate): candidate is ProfileHighlight => {
    if (!candidate || typeof candidate !== 'object') return false;
    const item = candidate as Record<string, unknown>;
    if (typeof item['kind'] !== 'string' || !['companion', 'image', 'video'].includes(item['kind']) || typeof item['id'] !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(item['id'])) return false;
    const key = `${item['kind']}:${item['id']}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, PROFILE_HIGHLIGHT_LIMIT).map(({kind, id}) => ({kind, id}));
}
