import type { GeneratedMedia } from "../types";

export type MediaCarouselMode = "auto" | "moments";

export function resolveMediaCarousel({
  media,
  current,
  mode = "auto",
  characterInstanceId,
}: {
  media: GeneratedMedia[];
  current?: GeneratedMedia;
  mode?: MediaCarouselMode;
  characterInstanceId?: string;
}) {
  if (!current) return { items: [], index: -1, previous: undefined, next: undefined };
  const readyImages = media
    .filter((item) => item.media_type === "image" && item.status === "ready" && Boolean(item.signed_url))
    .filter((item)=>item.metadata?.hiddenIntermediate!==true)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const items = mode === "moments"
    ? readyImages.filter((item) => !characterInstanceId || characterInstanceId === "all" || item.character_instance_id === characterInstanceId)
    : readyImages.filter((item) => sameAutomaticScope(item, current));
  const index = items.findIndex((item) => item.id === current.id);
  return {
    items,
    index,
    previous: index > 0 ? items[index - 1] : undefined,
    next: index >= 0 && index < items.length - 1 ? items[index + 1] : undefined,
  };
}

function sameAutomaticScope(candidate: GeneratedMedia, current: GeneratedMedia) {
  if (current.moment_id) return candidate.moment_id === current.moment_id;
  if (current.conversation_id) return candidate.conversation_id === current.conversation_id;
  return candidate.character_instance_id === current.character_instance_id;
}
