export function groupTimelineDayLabel(
  createdAt: string,
  previousCreatedAt?: string,
  now = new Date(),
): string | null {
  const current = new Date(createdAt);
  if (!Number.isFinite(current.getTime())) return null;
  const previous = previousCreatedAt ? new Date(previousCreatedAt) : null;
  if (
    previous && Number.isFinite(previous.getTime()) &&
    previous.toDateString() === current.toDateString()
  ) return null;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (current.toDateString() === now.toDateString()) return "TODAY";
  if (current.toDateString() === yesterday.toDateString()) return "YESTERDAY";
  return current.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).toUpperCase();
}

export function groupMediaNeedsRefresh(
  media: Array<{ id: string; status: string }>,
  offers: Array<{ status: string; generated_media_id?: string | null }>,
): boolean {
  if (media.some((item) => ["queued", "generating"].includes(item.status))) {
    return true;
  }
  const mediaById = new Map(media.map((item) => [item.id, item]));
  return offers.some((offer) => {
    if (offer.status !== "accepted") return false;
    const generated = offer.generated_media_id
      ? mediaById.get(offer.generated_media_id)
      : undefined;
    return !generated || ["queued", "generating"].includes(generated.status);
  });
}
