"use client";

import { use } from "react";
import ConfirmBookingLegacyPage from "@/app/(booking)/[username]/[eventSlug]/confirm/page";

/**
 * Confirm page for the fully random URL /b/<slug>/confirm.
 * Reuses the legacy component by shimming { username: "" } — the legacy
 * component only uses `username` when calling /api/booking-info, which now
 * accepts slug-only when username is empty.
 */
export default function ConfirmBookingBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const shimmed = Promise.resolve({ username: "", eventSlug: slug });
  return <ConfirmBookingLegacyPage params={shimmed} />;
}
