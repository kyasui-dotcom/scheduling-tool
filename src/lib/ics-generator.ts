import { createEvent, type EventAttributes } from "ics";

export function generateICS(params: {
  title: string;
  description: string;
  start: Date;
  durationMinutes: number;
  url?: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
}): string {
  const start = params.start;
  const event: EventAttributes = {
    start: [
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      start.getUTCDate(),
      start.getUTCHours(),
      start.getUTCMinutes(),
    ],
    duration: { minutes: params.durationMinutes },
    title: params.title,
    description: params.description,
    url: params.url,
    organizer: {
      name: params.organizerName,
      email: params.organizerEmail,
    },
    attendees: [
      {
        name: params.attendeeName,
        email: params.attendeeEmail,
        rsvp: true,
        partstat: "ACCEPTED",
        role: "REQ-PARTICIPANT",
      },
    ],
    status: "CONFIRMED",
  };

  const { value, error } = createEvent(event);
  if (error) throw error;
  return value!;
}

export function buildGoogleCalendarUrl(params: {
  title: string;
  startTime: Date;
  endTime: Date;
  description: string;
  location?: string;
}): string {
  const format = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0] + "Z";
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", params.title);
  url.searchParams.set(
    "dates",
    `${format(params.startTime)}/${format(params.endTime)}`
  );
  url.searchParams.set("details", params.description);
  if (params.location) url.searchParams.set("location", params.location);
  return url.toString();
}
