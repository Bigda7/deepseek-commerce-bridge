export const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function addCalendarDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function weekdayOf(date: string) {
  return weekdays[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function zoneParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    second: get("second"),
  };
}

export function localDateTime(instant: Date, timeZone: string) {
  const parts = zoneParts(instant, timeZone);
  return { date: parts.date, time: parts.time, timeZone };
}

export function resolveLocalInstant(
  date: string,
  time: string,
  timeZone: string,
) {
  const wall = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 12) {
    const sample = new Date(wall + hours * 3600000);
    const parts = zoneParts(sample, timeZone);
    offsets.add(
      Date.parse(`${parts.date}T${parts.time}:${parts.second}.000Z`) -
        sample.getTime(),
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((instant) => {
      const parts = zoneParts(instant, timeZone);
      return (
        parts.date === date && parts.time === time && parts.second === "00"
      );
    });
  if (matches.length === 0)
    return { status: "nonexistent" as const, instant: null };
  if (matches.length > 1)
    return { status: "ambiguous" as const, instant: null };
  return { status: "resolved" as const, instant: matches[0] };
}

export function addCalendarYear(
  date: string,
  leapDayRule: "clamp_to_february_28" | "march_1",
) {
  const year = Number(date.slice(0, 4)) + 1;
  if (date.endsWith("-02-29"))
    return `${year}-${leapDayRule === "march_1" ? "03-01" : "02-28"}`;
  return `${year}${date.slice(4)}`;
}
