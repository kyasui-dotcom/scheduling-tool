import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { inArray, ilike } from "drizzle-orm";

export function getEmailDomain(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Check whether viewer can manage events owned by target user.
 * Allowed if: same userId, OR same (non-empty) email domain.
 */
export async function canManageEventsOf(params: {
  viewerUserId: string;
  targetUserId: string;
}): Promise<boolean> {
  if (params.viewerUserId === params.targetUserId) return true;
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [params.viewerUserId, params.targetUserId]));
  const viewer = rows.find((r) => r.id === params.viewerUserId);
  const target = rows.find((r) => r.id === params.targetUserId);
  if (!viewer || !target) return false;
  const vd = getEmailDomain(viewer.email);
  const td = getEmailDomain(target.email);
  return vd !== "" && vd === td;
}

/**
 * Return all user IDs whose events this viewer can manage (self + same domain).
 */
export async function getManagedUserIds(viewerUserId: string): Promise<string[]> {
  const [viewer] = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, [viewerUserId]));
  if (!viewer) return [viewerUserId];
  const domain = getEmailDomain(viewer.email);
  if (!domain) return [viewerUserId];

  const sameDomain = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.email, `%@${domain}`));
  const ids = new Set(sameDomain.map((u) => u.id));
  ids.add(viewerUserId);
  return Array.from(ids);
}
