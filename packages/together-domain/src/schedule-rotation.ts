/** Calendar-week rotation, evaluated in the same timezone as the character's routine. */
export function scheduleRunsOnDate(
  metadata: Record<string, unknown> | null | undefined,
  date: Date | string,
  timezone = "UTC",
): boolean {
  const weeks = Number(metadata?.cycleWeeks ?? 1);
  if (!Number.isInteger(weeks) || weeks <= 1) return true;
  if (weeks > 3) return false;
  const key = typeof date === "string"
    ? date.slice(0, 10)
    : new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  const monday = (value: string) => {
    const stamp = Date.parse(value + "T12:00:00Z");
    const day = new Date(stamp).getUTCDay();
    return Math.floor(stamp / 86400000) - ((day + 6) % 7);
  };
  const anchor = String(metadata?.cycleAnchorDate ?? "1970-01-05");
  const elapsed = Math.floor((monday(key) - monday(anchor)) / 7);
  return Number.isFinite(elapsed) &&
    ((elapsed % weeks) + weeks) % weeks === Number(metadata?.weekIndex ?? 0);
}
