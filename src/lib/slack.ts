export interface SlackBookingPayload {
  eventTitle: string;
  companyName: string;
  guestName: string;
  guestEmail: string;
  startTime: Date;
  endTime: Date;
  assigneeName: string;
  assigneeEmail: string;
  meetingUrl: string | null;
  meetingPlatform: string;
  customAnswers?: { question: string; answer: string }[];
  guestNotes?: string;
  manageUrl: string;
}

function fmtJst(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
    hour12: false,
  }).format(d);
}

/**
 * Post a booking-created notification to a Slack Incoming Webhook.
 * Non-blocking — caller should try/catch and continue booking flow.
 */
export async function notifySlackNewBooking(
  webhookUrl: string,
  payload: SlackBookingPayload
): Promise<void> {
  const platformLabel =
    payload.meetingPlatform === "google_meet"
      ? "Google Meet"
      : payload.meetingPlatform === "zoom"
      ? "Zoom"
      : "対面/電話";

  const fieldLines = [
    `*会社:* ${payload.companyName}`,
    `*担当者:* ${payload.guestName} (${payload.guestEmail})`,
    `*日時:* ${fmtJst(payload.startTime)} 〜 ${fmtJst(payload.endTime)}`,
    `*カレンダー担当:* ${payload.assigneeName || payload.assigneeEmail}`,
    `*会議:* ${platformLabel}${
      payload.meetingUrl ? ` <${payload.meetingUrl}|参加する>` : ""
    }`,
  ];

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📅 予約: ${payload.eventTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: fieldLines.join("\n"),
      },
    },
  ];

  if (payload.guestNotes) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*顧客メモ:*\n${payload.guestNotes}`,
      },
    });
  }

  if (payload.customAnswers && payload.customAnswers.length > 0) {
    const answersText = payload.customAnswers
      .map((a) => `• *${a.question}*: ${a.answer}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*予約時の回答:*\n${answersText}`,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${payload.manageUrl}|予約の変更・キャンセル>`,
      },
    ],
  });

  const body = {
    text: `新規予約: ${payload.eventTitle} - ${payload.companyName} / ${payload.guestName}`,
    blocks,
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${text}`);
  }
}
