export const PLAN_ACTIVITY_MAX_LENGTH = 120;

export function cleanPlanActivity(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Keep place-authored labels readable and avoid repeated or current choices. */
export function planActivityOptions(values: string[], current: string): string[] {
  const key = (value: string) => cleanPlanActivity(value.replace(/[_-]+/g, ' ')).toLowerCase();
  const seen = new Set([key(current)]);
  return values.flatMap((value) => {
    const label = cleanPlanActivity(value.replace(/_/g, ' '));
    if (!label || label.length > PLAN_ACTIVITY_MAX_LENGTH || seen.has(key(label))) return [];
    seen.add(key(label));
    return [label.charAt(0).toUpperCase() + label.slice(1)];
  }).slice(0, 12);
}
