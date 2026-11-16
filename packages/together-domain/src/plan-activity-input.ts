/** Authored activities keep their existing keys; custom activities keep the user's wording. */
export function parsePlanActivity(value: string, authored: readonly string[] = []): { key: string; label: string; custom: boolean } | null {
  const label = value.replace(/\s+/g, ' ').trim();
  if (!label || label.length > 120) return null;
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalized = normalize(label);
  const matched = normalized && authored.some(activity => normalize(activity) === normalized);
  return matched
    ? { key: normalized.replace(/\s+/g, '_'), label: normalized, custom: false }
    : { key: label, label, custom: true };
}
