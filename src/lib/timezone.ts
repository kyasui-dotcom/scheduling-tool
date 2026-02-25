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
 * Convert a local time string (HH:MM) on a specific date in a timezone to a UTC Date.
 *
 * Example: localTimeToUTC("2026-03-01", "09:00", "Asia/Tokyo")
 *   → 2026-03-01T00:00:00.000Z (because JST is UTC+9)
 */
export function localTimeToUTC(
  dateStr: string, // YYYY-MM-DD
  timeStr: string, // HH:MM or HH:MM:SS
  timezone: string
): Date {
  // Normalize timeStr to HH:MM
  const timeParts = timeStr.split(":");
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);

  // Create a reference UTC date, then figure out what UTC time corresponds
  // to the desired local time in the given timezone.

  // Step 1: Start with a UTC date at midnight of the target date
  const utcBase = new Date(`${dateStr}T00:00:00Z`);

  // Step 2: Find what time it is in the target timezone when UTC is at midnight
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcBase);

  const tzHour = parseInt(tzParts.find((p) => p.type === "hour")!.value, 10);
  const tzMinute = parseInt(tzParts.find((p) => p.type === "minute")!.value, 10);
  const tzDay = parseInt(tzParts.find((p) => p.type === "day")!.value, 10);
  const baseDay = parseInt(dateStr.split("-")[2], 10);

  // Step 3: Calculate the offset in minutes
  // When UTC is 00:00 on dateStr, timezone shows tzHour:tzMinute
  // So offset = tzTime - utcTime (in minutes)
  let offsetMinutes = tzHour * 60 + tzMinute;

  // Handle day boundary: if timezone is ahead (e.g., JST = UTC+9),
  // at UTC midnight the local time is in the same day but ahead
  // If timezone is behind (e.g., PST = UTC-8), local day might be previous day
  if (tzDay > baseDay) {
    // Timezone is ahead, add nothing special
  } else if (tzDay < baseDay) {
    // Timezone is behind UTC, offset is negative
    offsetMinutes = offsetMinutes - 24 * 60;
  }

  // Step 4: The desired UTC time = desired_local_time - offset
  const desiredLocalMinutes = hours * 60 + minutes;
  const utcMinutes = desiredLocalMinutes - offsetMinutes;

  const result = new Date(`${dateStr}T00:00:00Z`);
  result.setUTCMinutes(result.getUTCMinutes() + utcMinutes);

  return result;
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
