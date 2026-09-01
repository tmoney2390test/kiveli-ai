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

export type GroupRecipientSelection = string;

export function groupRecipientRequest(
  selection: GroupRecipientSelection,
  participantIds: readonly string[],
): {
  manualSpeakerInstanceId?: string;
  broadGroupRequest?: boolean;
} {
  if (selection === "everyone") return { broadGroupRequest: true };
  if (selection === "automatic") return {};
  return participantIds.includes(selection)
    ? { manualSpeakerInstanceId: selection }
    : {};
}

export function groupTurnStatusLabel(
  people: readonly { name: string }[],
  sending: boolean,
): string | null {
  if (people.length === 1) return `${people[0]!.name} is replying…`;
  if (people.length === 2) {
    return `${people[0]!.name} and ${people[1]!.name} are replying…`;
  }
  if (people.length > 2) return `${people.length} companions are replying…`;
  return sending ? "Choosing who responds…" : null;
}

export function groupWelcomePrompts(names: readonly string[]): string[] {
  const first = names[0] ?? "everyone";
  const second = names[1];
  return [
    "What is everyone up to right now?",
    second
      ? `${first}, ask ${second} something you have always wondered.`
      : `${first}, tell me what is on your mind.`,
    "Let us make a plan together.",
  ];
}

export function groupReplyAuthorLabel(
  reply: { role: string; speaker_character_instance_id?: string | null; character_instance_id?: string | null },
  participantNames: ReadonlyMap<string, string>,
): string {
  if (reply.role === "user") return "you";
  const id = String(reply.speaker_character_instance_id ?? reply.character_instance_id ?? "");
  return firstName(participantNames.get(id) ?? "a companion");
}

export function groupHandoffLabel(
  metadata: unknown,
  participantNames: ReadonlyMap<string, string>,
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const ids = (metadata as Record<string, unknown>).addresseeInstanceIds;
  if (!Array.isArray(ids)) return null;
  const names = ids.map((id) => participantNames.get(String(id))).filter((name): name is string => Boolean(name)).map(firstName);
  if (!names.length) return null;
  return `to ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`}`;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value;
}
