type PolicyRow = {
  content_rating?: unknown;
  visibility_scope?: unknown;
  moderation_version?: unknown;
  moderation_status?: unknown;
  source_message_id?: unknown;
};

const adultVersions = new Set([
  'private-adult-text-v1',
  'web-adult-v1',
  'legacy-adult-route-v1',
]);

export function canRememberMessage(row: PolicyRow, authorizedWebAdult: boolean): boolean {
  if (row.visibility_scope === 'all' && (row.content_rating === 'safe' || row.content_rating === 'suggestive')) return true;
  return authorizedWebAdult && row.content_rating === 'explicit' &&
    (row.visibility_scope === 'all' || row.visibility_scope === 'web_adult') &&
    row.moderation_status === 'approved' && adultVersions.has(String(row.moderation_version ?? ''));
}

export function canViewMemory(row: PolicyRow, authorizedWebAdult: boolean): boolean {
  if (row.visibility_scope === 'all' && (row.content_rating === 'safe' || row.content_rating === 'suggestive')) return true;
  return authorizedWebAdult && Boolean(row.source_message_id) &&
    row.content_rating === 'explicit' &&
    (row.visibility_scope === 'all' || row.visibility_scope === 'web_adult') &&
    adultVersions.has(String(row.moderation_version ?? ''));
}
