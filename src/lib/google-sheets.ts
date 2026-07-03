import { google } from "googleapis";
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
 * Append a row to the first (or specified) sheet of a spreadsheet.
 * Uses the user's OAuth token (needs the spreadsheets scope).
 * Fails silently — caller should try/catch and continue booking flow.
 */
export async function appendRowToSheet(params: {
  userId: string;
  spreadsheetUrl: string;
  values: (string | number | null | undefined)[];
  sheetName?: string; // default: first sheet
}): Promise<void> {
  const sheetId = extractSheetIdFromUrl(params.spreadsheetUrl);
  if (!sheetId) {
    throw new Error("Invalid Google Sheets URL");
  }
  const accessToken = await getValidGoogleToken(params.userId);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: "v4", auth });

  // Resolve sheet name — if not specified, use the first sheet
  let range: string;
  if (params.sheetName) {
    range = `${params.sheetName}!A1`;
  } else {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const first = meta.data.sheets?.[0]?.properties?.title || "Sheet1";
    range = `${first}!A1`;
  }

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
