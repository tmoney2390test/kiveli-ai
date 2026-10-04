const scheduleFiller = /^(?:making time for a familiar routine|following the day['’]s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today['’]s work|taking care of the day['’]s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep|spending some time at home)[.!]?$/i;
const vagueHomeAlternative = /^(?:having some quiet time at home|keeping this part of the day private at home)[.!]?$/i;
const vagueSuffix = /\s+while leaving room for the day to change naturally[.!]?$/i;

export function cleanScheduleActivity(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim().replace(vagueSuffix, '').trim();
  return scheduleFiller.test(cleaned) ? '' : cleaned;
}

export function specificScheduleVariants(values: unknown, fallback?: string): string[] {
  const candidates: unknown[] = Array.isArray(values) ? values as unknown[] : [];
  const cleanedCandidates = [...candidates, fallback].map(cleanScheduleActivity).filter(Boolean);
  const hasSpecificAlternative = cleanedCandidates.some(value => !vagueHomeAlternative.test(value));
  const unique = new Set<string>();
  for (const cleaned of cleanedCandidates) {
    if (hasSpecificAlternative && vagueHomeAlternative.test(cleaned)) continue;
    unique.add(cleaned);
  }
  return [...unique];
}
