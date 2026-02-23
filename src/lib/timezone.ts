export function formatTimeInZone(
  isoString: string,
  timezone: string,
  locale = "ja-JP"
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    hour12: false,
  }).format(new Date(isoString));
}

export function formatDateInZone(
  isoString: string,
  timezone: string,
  locale = "ja-JP"
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: timezone,
  }).format(new Date(isoString));
}

export function formatDateTimeInZone(
  isoString: string,
  timezone: string,
  locale = "ja-JP"
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    hour12: false,
  }).format(new Date(isoString));
}

/**
 * Convert a local time string (HH:MM) on a specific date in a timezone to a UTC Date
 */
export function localTimeToUTC(
  dateStr: string, // YYYY-MM-DD
  timeStr: string, // HH:MM
  timezone: string
): Date {
  // Create a date string in the specified timezone
  const dateTimeStr = `${dateStr}T${timeStr}:00`;

  // Use Intl to get the UTC offset for this timezone at this date/time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parse the local time and find the UTC equivalent
  const localDate = new Date(dateTimeStr);
  const utcDate = new Date(
    localDate.toLocaleString("en-US", { timeZone: "UTC" })
  );
  const tzDate = new Date(
    localDate.toLocaleString("en-US", { timeZone: timezone })
  );
  const offset = utcDate.getTime() - tzDate.getTime();

  // Create the date in the target timezone
  const targetDate = new Date(`${dateStr}T${timeStr}:00.000Z`);
  return new Date(targetDate.getTime() - offset);
}

/**
 * Get the day of week name for a date in a specific timezone
 */
export function getDayOfWeekInTimezone(
  date: Date,
  timezone: string
): string {
  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  })
    .format(date)
    .toLowerCase();
  return dayName;
}

/**
 * Get the date string (YYYY-MM-DD) for a Date in a specific timezone
 */
export function getDateStringInTimezone(
  date: Date,
  timezone: string
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;

  return `${year}-${month}-${day}`;
}
