// Compact authoring format for reviewed public Pulse incidents. Each row still
// contains a concrete observation and an unresolved decision, not a prompt to
// improvise a whole event at runtime.
export function defineNewcomerPack(worldIntroduction, cohorts, briefs) {
  const groups = cohorts.map((cohort) => cohort.map(([slug]) => slug));
  const leadRoles = Object.fromEntries(cohorts.flat().map(([slug, role]) => [slug, role]));
  const supportRoles = leadRoles;
  const contributions = Object.fromEntries(cohorts.flat().map(([slug, , action]) => [slug, action]));
  const incidents = {};
  for (const [slug, title, location, observed, unresolved, type] of briefs) {
    (incidents[slug] ??= []).push([title, location, observed, unresolved, type]);
  }
  return { worldIntroduction, groups, leadRoles, supportRoles, contributions, incidents };
}
