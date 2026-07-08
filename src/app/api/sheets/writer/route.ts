import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServiceAccountEmail } from "@/lib/google-sheets";

const SHEETS_WRITER_EMAIL =
  process.env.SHEETS_WRITER_EMAIL || "k.yasui@raksul.com";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceEmail = getServiceAccountEmail();
  return NextResponse.json({
    // Which email the organizer needs to invite as editor on their spreadsheet.
    inviteEmail: serviceEmail || SHEETS_WRITER_EMAIL,
    via: serviceEmail ? "service_account" : "user_oauth",
  });
}
