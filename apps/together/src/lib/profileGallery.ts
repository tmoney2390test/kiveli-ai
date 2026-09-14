/** Keep paginated media in newest-first order even when older pins load first. */
export function mergeProfileGalleryMedia<T extends { id: string; created_at: string }>(first: T[], second: T[]): T[] {
  const byId = new Map([...first, ...second].map((item) => [item.id, item]));
  return [...byId.values()].sort((left, right) =>
    Date.parse(right.created_at) - Date.parse(left.created_at) || left.id.localeCompare(right.id));
}
