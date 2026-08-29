export const GROUP_PARTICIPANT_LIMIT = 5;

export function groupInviteParticipantIds(currentParticipantIds: string[], invitedCharacterId: string, limit = GROUP_PARTICIPANT_LIMIT): string[] {
  const invited = invitedCharacterId.trim();
  if (!invited || limit < 1) return [];
  const existing = [...new Set(currentParticipantIds.map((id) => id.trim()).filter((id) => id && id !== invited))];
  return [...existing.slice(0, Math.max(0, limit - 1)), invited];
}

export function parseGroupPrefillParticipants(value?: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))].slice(0, GROUP_PARTICIPANT_LIMIT);
}

export function newGroupPrefillHref(input: { currentParticipantIds: string[]; invitedCharacterId: string; worldId?: string | null }): string {
  const participants = groupInviteParticipantIds(input.currentParticipantIds, input.invitedCharacterId);
  const params = [`participants=${encodeURIComponent(participants.join(','))}`];
  if (input.worldId) params.push(`world=${encodeURIComponent(input.worldId)}`);
  return `/new-group?${params.join('&')}`;
}
