import { google } from "googleapis";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function getValidGoogleToken(userId: string): Promise<string> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));

  if (!account) throw new Error("No Google account linked");

  const isExpired = account.expires_at
    ? account.expires_at * 1000 < Date.now()
    : true;

  if (!isExpired && account.access_token) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("No refresh token available. Please re-authenticate.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const tokens = await response.json();

  if (!response.ok) throw new Error("Failed to refresh Google token");

  await db
    .update(accounts)
    .set({
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
    })
    .where(
      and(eq(accounts.provider, "google"), eq(accounts.userId, userId))
    );

  return tokens.access_token;
}

function createOAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

export async function getFreeBusy(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<Array<{ start: string; end: string }>> {
  const accessToken = await getValidGoogleToken(userId);
  const auth = createOAuthClient(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: "UTC",
      items: [{ id: "primary" }],
    },
  });

  const busy = response.data.calendars?.primary?.busy ?? [];
  return busy.map((b) => ({
    start: b.start!,
    end: b.end!,
  }));
}

export async function getMultiUserFreeBusy(
  userIds: string[],
  timeMin: string,
  timeMax: string
): Promise<Map<string, Array<{ start: string; end: string }>>> {
  const results = new Map<string, Array<{ start: string; end: string }>>();

  // Query each user's calendar in parallel
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const busy = await getFreeBusy(userId, timeMin, timeMax);
        results.set(userId, busy);
      } catch {
        // If we can't get a user's calendar, treat them as fully busy
        results.set(userId, [{ start: timeMin, end: timeMax }]);
      }
    })
  );

  return results;
}

export async function createCalendarEvent(params: {
  userId: string;
  summary: string;
  description: string;
  startTime: string;
  endTime: string;
  attendeeEmails: string[];
  includeGoogleMeet: boolean;
  location?: string;
}): Promise<{ eventId: string; meetUrl?: string }> {
  const accessToken = await getValidGoogleToken(params.userId);
  const auth = createOAuthClient(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const eventBody: {
    summary: string;
    description: string;
    start: { dateTime: string };
    end: { dateTime: string };
    attendees: Array<{ email: string }>;
    location?: string;
    conferenceData?: {
      createRequest: {
        requestId: string;
        conferenceSolutionKey: { type: string };
      };
    };
  } = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: params.startTime },
    end: { dateTime: params.endTime },
    attendees: params.attendeeEmails.map((email) => ({ email })),
  };

  if (params.location) {
    eventBody.location = params.location;
  }

  if (params.includeGoogleMeet) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `meet-${crypto.randomUUID()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
    conferenceDataVersion: params.includeGoogleMeet ? 1 : 0,
    sendNotifications: true,
  });

  return {
    eventId: response.data.id!,
    meetUrl:
      response.data.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video"
      )?.uri ?? undefined,
  };
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const accessToken = await getValidGoogleToken(userId);
  const auth = createOAuthClient(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendNotifications: true,
  });
}
