import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getValidGoogleToken } from "@/lib/google-calendar";

/**
 * Extract the Sheets ID from a Google Sheets URL.
 * Accepts URLs like https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
 */
export function extractSheetIdFromUrl(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Extract the sheet (tab) gid from a Google Sheets URL.
 * Examples: /edit#gid=123456789, /edit?gid=0
 * Returns null when no gid is present (caller should default to the first sheet).
 */
export function extractSheetGidFromUrl(url: string): string | null {
  const m = url.match(/[?#&]gid=(\d+)/);
  return m ? m[1] : null;
}

/**
 * Parse GOOGLE_SPREADSHEET env var as a Google service-account credentials JSON.
 * Accepts either raw JSON or base64-encoded JSON.
 * Returns null if the env var is not set or malformed.
 */
function parseServiceAccountEnv(): {
  client_email: string;
  private_key: string;
} | null {
  const raw = process.env.GOOGLE_SPREADSHEET;
  if (!raw) return null;
  try {
    let creds: { client_email?: string; private_key?: string };
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      creds = JSON.parse(trimmed);
    } else {
      const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
      creds = JSON.parse(decoded);
    }
    if (!creds.client_email || !creds.private_key) return null;
    // Normalize escaped newlines in the private key (common with env vars)
    return {
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

/**
 * The email address the service account uses — surface this to users so they
 * can invite it as an editor on their target spreadsheets.
 */
export function getServiceAccountEmail(): string | null {
  return parseServiceAccountEnv()?.client_email || null;
}

/**
 * Return an authenticated client for the Sheets API.
 * Prefers the service account from GOOGLE_SPREADSHEET when configured;
 * falls back to the user's OAuth token when userId is provided.
 */
async function getSheetsAuth(userId?: string): Promise<{
  auth: OAuth2Client | import("google-auth-library").JWT;
  via: "service_account" | "user_oauth";
}> {
  const sa = parseServiceAccountEnv();
  if (sa) {
    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    await auth.authorize();
    return { auth, via: "service_account" };
  }
  if (!userId) {
    throw new Error(
      "No sheets auth available: GOOGLE_SPREADSHEET env var is not set and no userId provided"
    );
  }
  const accessToken = await getValidGoogleToken(userId);
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  return { auth: oauth, via: "user_oauth" };
}

/**
 * Append a row to the first (or specified) sheet of a spreadsheet.
 * Uses the service account when GOOGLE_SPREADSHEET is configured;
 * otherwise falls back to the given user's OAuth token.
 */
export async function appendRowToSheet(params: {
  userId?: string; // optional; used only when service account is not configured
  spreadsheetUrl: string;
  values: (string | number | null | undefined)[];
  sheetName?: string;
}): Promise<void> {
  const sheetId = extractSheetIdFromUrl(params.spreadsheetUrl);
  if (!sheetId) throw new Error("Invalid Google Sheets URL");

  const { auth } = await getSheetsAuth(params.userId);
  // Cast satisfies google.sheets typing (accepts JWT | OAuth2Client)
  const sheets = google.sheets({
    version: "v4",
    auth: auth as unknown as OAuth2Client,
  });

  const range = await resolveRange(sheets, sheetId, {
    sheetName: params.sheetName,
    gid: extractSheetGidFromUrl(params.spreadsheetUrl),
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [params.values.map((v) => (v == null ? "" : String(v)))],
    },
  });
}

/**
 * Append many rows in a single API call.
 */
export async function appendRowsToSheet(params: {
  userId?: string;
  spreadsheetUrl: string;
  rows: (string | number | null | undefined)[][];
  sheetName?: string;
}): Promise<void> {
  const sheetId = extractSheetIdFromUrl(params.spreadsheetUrl);
  if (!sheetId) throw new Error("Invalid Google Sheets URL");
  if (params.rows.length === 0) return;

  const { auth } = await getSheetsAuth(params.userId);
  const sheets = google.sheets({
    version: "v4",
    auth: auth as unknown as OAuth2Client,
  });

  const range = await resolveRange(sheets, sheetId, {
    sheetName: params.sheetName,
    gid: extractSheetGidFromUrl(params.spreadsheetUrl),
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: params.rows.map((row) =>
        row.map((v) => (v == null ? "" : String(v)))
      ),
    },
  });
}

async function resolveRange(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  opts: { sheetName?: string; gid?: string | null }
): Promise<string> {
  if (opts.sheetName) return `${opts.sheetName}!A1`;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if (opts.gid) {
    const target = meta.data.sheets?.find(
      (s) => String(s.properties?.sheetId) === opts.gid
    );
    if (target?.properties?.title) return `${target.properties.title}!A1`;
  }
  const first = meta.data.sheets?.[0]?.properties?.title || "Sheet1";
  return `${first}!A1`;
}
