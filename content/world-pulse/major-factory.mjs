// Authored major incidents use a compact source format; the resulting records
// match the V2 Pulse schema. Public copy never includes participant asides.
export function majorIncident(worldSlug, slug, title, feedSummary, detailBody, locationSlug, witnesses, groupMessage) {
  const participants = witnesses.map(([characterSlug, roleLabel, perspective, defaultDirectMessage]) => ({
    characterSlug, roleLabel, perspective, defaultDirectMessage,
    knownFactIds: ['public-report'],
    revealConstraints: ["Speak from your own observations. Do not claim another witness's private reason."],
  }));
  return {
    slug, repeatIdentity: `${worldSlug}:major:${slug}`, contentVersion: 1,
    worldSlug, title, feedSummary, detailBody, eventType: 'colony_wide',
    locationSlug, significance: .95, primaryCharacterSlug: participants[0]?.characterSlug,
    participants, facts: [{ id: 'public-report', text: feedSummary, userVisible: true,
      knownBy: participants.map((person) => person.characterSlug) }],
    groupMessage, contentRating: 'standard', cooldownDays: 60,
    tags: ['worldwide', 'major-incident'],
  };
}
