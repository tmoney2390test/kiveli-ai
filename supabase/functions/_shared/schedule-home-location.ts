export function activityRequiresHome(activityKey: string, activity: string): boolean {
  const key=activityKey.toLowerCase();
  return key === 'sleep' || key.startsWith('home')
    || /\b(?:at home|home for the|home tonight)\b/i.test(activity);
}

export function recurringScheduleLocationId(
  activityKey: string,
  activity: string,
  templateLocationId: string | null,
  homeLocationId: string,
): string {
  return activityRequiresHome(activityKey, activity) ? homeLocationId : templateLocationId ?? homeLocationId;
}
