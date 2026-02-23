let cachedToken: { token: string; expiresAt: number } | null = null;

async function getZoomAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: process.env.ZOOM_ACCOUNT_ID!,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Zoom token error: ${data.reason}`);

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  };

  return data.access_token;
}

export async function createZoomMeeting(params: {
  topic: string;
  startTime: string;
  durationMinutes: number;
}): Promise<{ meetingId: string; joinUrl: string }> {
  const token = await getZoomAccessToken();

  const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: params.topic,
      type: 2,
      start_time: params.startTime,
      duration: params.durationMinutes,
      timezone: "UTC",
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: "none",
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Zoom meeting error: ${data.message}`);

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
  };
}
