import { db } from "@/lib/db";
import {
  eventTypes,
  eventTypeMembers,
  availabilitySchedules,
  availabilityRules,
  availabilityOverrides,
  bookings,
} from "@/lib/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { getMultiUserFreeBusy } from "@/lib/google-calendar";
import { addMinutes, startOfDay, endOfDay, addDays } from "date-fns";
import { localTimeToUTC, getDayOfWeekInTimezone } from "@/lib/timezone";

export type SlotMode = "fixed_slots" | "flexible_start";

export interface TimeSlot {
  startTime: string;
  endTime: string;
  availableUserIds?: string[];
}

export interface FlexibleWindow {
  startTime: string;       // earliest meeting start (ISO)
  latestStartTime: string; // latest meeting start (ISO)
  availableUserIds?: string[];
}

export interface AvailabilityResult {
  mode: SlotMode;
  slots: TimeSlot[];
  windows: FlexibleWindow[];
}

interface RawWindow {
  start: Date;
  end: Date;
}

interface MergedWindow extends RawWindow {
  userIds: string[];
}

export async function getAvailability(params: {
  eventTypeId: string;
  date: string; // YYYY-MM-DD in guest TZ
  guestTimezone: string;
}): Promise<AvailabilityResult> {
  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, params.eventTypeId));

  if (!eventType || !eventType.isActive) {
    return { mode: "fixed_slots", slots: [], windows: [] };
  }

  const mode: SlotMode = eventType.slotMode ?? "fixed_slots";

  const members = await db
    .select({ userId: eventTypeMembers.userId })
    .from(eventTypeMembers)
    .where(eq(eventTypeMembers.eventTypeId, params.eventTypeId));

  const memberUserIds =
    members.length > 0 ? members.map((m) => m.userId) : [eventType.userId];

  const perUserWindows = await computePerUserWindows({
    userIds: memberUserIds,
    eventTypeId: params.eventTypeId,
    date: params.date,
    durationMinutes: eventType.durationMinutes,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes || 0,
    bufferAfterMinutes: eventType.bufferAfterMinutes || 0,
    schedulingMode: eventType.schedulingMode,
  });

  // Aggregate per-user windows by scheduling mode
  let merged: MergedWindow[];
  switch (eventType.schedulingMode) {
    case "all_available":
      merged = intersectAllUsers(perUserWindows, memberUserIds);
      break;
    case "any_available":
      merged = unionWithUsers(perUserWindows);
      break;
    case "specific_person":
    default: {
      const uid = memberUserIds[0];
      merged = (perUserWindows.get(uid) || []).map((w) => ({
        ...w,
        userIds: [uid],
      }));
      break;
    }
  }

  // Clamp by minNotice / maxAdvance
  const now = new Date();
  const minNotice = addMinutes(now, eventType.minNoticeMinutes || 0);
  const maxAdvance = addDays(now, eventType.maxAdvanceDays || 60);
  merged = merged
    .map((w) => ({
      start: w.start.getTime() < minNotice.getTime() ? minNotice : w.start,
      end: w.end.getTime() > maxAdvance.getTime() ? maxAdvance : w.end,
      userIds: w.userIds,
    }))
    .filter((w) => w.start.getTime() < w.end.getTime());

  const inGuestDate = (d: Date) =>
    formatDateInTz(d, params.guestTimezone) === params.date;

  if (mode === "flexible_start") {
    const windows: FlexibleWindow[] = [];
    for (const w of merged) {
      const latestStart = addMinutes(w.end, -eventType.durationMinutes);
      if (latestStart.getTime() < w.start.getTime()) continue;
      // Keep windows that have ANY valid start on the target guest date
      if (!inGuestDate(w.start) && !inGuestDate(latestStart)) continue;
      // Clip to the guest date's bounds so the picker shows times within the chosen day
      const dayStart = guestDayStart(params.date, params.guestTimezone);
      const dayEnd = guestDayEnd(params.date, params.guestTimezone);
      const effStart = w.start.getTime() < dayStart.getTime() ? dayStart : w.start;
      const effLatest =
        latestStart.getTime() > dayEnd.getTime() ? dayEnd : latestStart;
      if (effLatest.getTime() < effStart.getTime()) continue;
      windows.push({
        startTime: effStart.toISOString(),
        latestStartTime: effLatest.toISOString(),
        availableUserIds: w.userIds,
      });
    }
    return { mode, slots: [], windows };
  }

  // fixed_slots: slice merged windows into duration-sized slots
  const slots: TimeSlot[] = [];
  for (const w of merged) {
    let slotStart = w.start;
    while (
      addMinutes(slotStart, eventType.durationMinutes).getTime() <=
      w.end.getTime()
    ) {
      const slotEnd = addMinutes(slotStart, eventType.durationMinutes);
      if (inGuestDate(slotStart)) {
        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          availableUserIds: w.userIds,
        });
      }
      slotStart = slotEnd;
    }
  }
  slots.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  return { mode, slots, windows: [] };
}

/**
 * Backward-compat: legacy callers expect a flat slot array.
 * Returns fixed slots; for flexible_start events it returns the windows
 * collapsed to their earliest start as a single representative slot.
 */
export async function getAvailableSlots(params: {
  eventTypeId: string;
  date: string;
  guestTimezone: string;
}): Promise<TimeSlot[]> {
  const result = await getAvailability(params);
  if (result.mode === "fixed_slots") return result.slots;
  return result.windows.map((w) => ({
    startTime: w.startTime,
    endTime: w.latestStartTime,
    availableUserIds: w.availableUserIds,
  }));
}

/**
 * For flexible_start bookings: check if `startTime` falls in any available window.
 * Returns the matching window's availableUserIds, or null if not available.
 */
export async function isFlexibleStartAvailable(params: {
  eventTypeId: string;
  startTimeIso: string;
  guestTimezone: string;
}): Promise<{ availableUserIds: string[] } | null> {
  const date = formatDateInTz(new Date(params.startTimeIso), params.guestTimezone);
  const result = await getAvailability({
    eventTypeId: params.eventTypeId,
    date,
    guestTimezone: params.guestTimezone,
  });
  const t = new Date(params.startTimeIso).getTime();
  for (const w of result.windows) {
    if (
      t >= new Date(w.startTime).getTime() &&
      t <= new Date(w.latestStartTime).getTime()
    ) {
      return { availableUserIds: w.availableUserIds || [] };
    }
  }
  return null;
}

export async function selectAssignee(
  availableUserIds: string[],
  eventTypeId: string
): Promise<string> {
  if (availableUserIds.length === 1) return availableUserIds[0];

  const bookingCounts = await db
    .select({ userId: bookings.assignedUserId })
    .from(bookings)
    .where(
      and(
        eq(bookings.eventTypeId, eventTypeId),
        eq(bookings.status, "confirmed"),
        inArray(bookings.assignedUserId, availableUserIds)
      )
    );

  const countMap = new Map<string, number>();
  for (const b of bookingCounts) {
    if (b.userId) countMap.set(b.userId, (countMap.get(b.userId) || 0) + 1);
  }

  let minCount = Infinity;
  let assignee = availableUserIds[0];
  for (const uid of availableUserIds) {
    const count = countMap.get(uid) ?? 0;
    if (count < minCount) {
      minCount = count;
      assignee = uid;
    }
  }
  return assignee;
}

// ----- helpers -----

async function computePerUserWindows(params: {
  userIds: string[];
  eventTypeId: string;
  date: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  schedulingMode: string;
}): Promise<Map<string, RawWindow[]>> {
  const dayStart = new Date(`${params.date}T00:00:00Z`);
  const dayEnd = new Date(`${params.date}T23:59:59Z`);
  const queryStart = addDays(dayStart, -1);
  const queryEnd = addDays(dayEnd, 1);

  const busyData = await getMultiUserFreeBusy(
    params.userIds,
    queryStart.toISOString(),
    queryEnd.toISOString()
  );

  const existingBookings = await db
    .select({
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      assignedUserId: bookings.assignedUserId,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.eventTypeId, params.eventTypeId),
        eq(bookings.status, "confirmed"),
        gte(bookings.startTime, queryStart),
        lte(bookings.endTime, queryEnd)
      )
    );

  const perUser = new Map<string, RawWindow[]>();

  for (const userId of params.userIds) {
    const [schedule] = await db
      .select()
      .from(availabilitySchedules)
      .where(
        and(
          eq(availabilitySchedules.userId, userId),
          eq(availabilitySchedules.isDefault, true)
        )
      );

    if (!schedule) {
      perUser.set(userId, []);
      continue;
    }

    const rules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.scheduleId, schedule.id));

    const overrides = await db
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          eq(availabilityOverrides.userId, userId),
          gte(availabilityOverrides.date, startOfDay(new Date(params.date))),
          lte(availabilityOverrides.date, endOfDay(new Date(params.date)))
        )
      );

    if (overrides.some((o) => o.isBlocked)) {
      perUser.set(userId, []);
      continue;
    }

    const dayOfWeek = getDayOfWeekInTimezone(
      new Date(params.date + "T12:00:00Z"),
      schedule.timezone
    );
    const dayRules = rules.filter((r) => r.dayOfWeek === dayOfWeek);

    let windows: RawWindow[] = [];

    if (
      overrides.length > 0 &&
      overrides.some((o) => !o.isBlocked && o.startTime && o.endTime)
    ) {
      for (const o of overrides) {
        if (!o.isBlocked && o.startTime && o.endTime) {
          windows.push({
            start: localTimeToUTC(params.date, o.startTime, schedule.timezone),
            end: localTimeToUTC(params.date, o.endTime, schedule.timezone),
          });
        }
      }
    } else {
      for (const r of dayRules) {
        windows.push({
          start: localTimeToUTC(params.date, r.startTime, schedule.timezone),
          end: localTimeToUTC(params.date, r.endTime, schedule.timezone),
        });
      }
    }

    const userBusy = busyData.get(userId) || [];
    for (const b of userBusy) {
      windows = subtractPeriod(windows, new Date(b.start), new Date(b.end));
    }

    const userBookings = existingBookings.filter(
      (b) =>
        b.assignedUserId === userId ||
        params.schedulingMode === "all_available"
    );
    for (const b of userBookings) {
      const bs = addMinutes(b.startTime, -params.bufferBeforeMinutes);
      const be = addMinutes(b.endTime, params.bufferAfterMinutes);
      windows = subtractPeriod(windows, bs, be);
    }

    windows.sort((a, b) => a.start.getTime() - b.start.getTime());
    perUser.set(userId, windows);
  }

  return perUser;
}

function subtractPeriod(
  windows: RawWindow[],
  busyStart: Date,
  busyEnd: Date
): RawWindow[] {
  const result: RawWindow[] = [];
  for (const w of windows) {
    if (busyEnd <= w.start || busyStart >= w.end) {
      result.push(w);
      continue;
    }
    if (busyStart <= w.start && busyEnd >= w.end) continue;
    if (busyStart > w.start) result.push({ start: w.start, end: busyStart });
    if (busyEnd < w.end) result.push({ start: busyEnd, end: w.end });
  }
  return result;
}

function unionWithUsers(
  perUser: Map<string, RawWindow[]>
): MergedWindow[] {
  const all: MergedWindow[] = [];
  for (const [userId, ws] of perUser) {
    for (const w of ws) all.push({ start: w.start, end: w.end, userIds: [userId] });
  }
  all.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: MergedWindow[] = [];
  for (const w of all) {
    const last = merged[merged.length - 1];
    if (last && last.end.getTime() >= w.start.getTime()) {
      if (w.end.getTime() > last.end.getTime()) last.end = w.end;
      for (const u of w.userIds) {
        if (!last.userIds.includes(u)) last.userIds.push(u);
      }
    } else {
      merged.push({ start: w.start, end: w.end, userIds: [...w.userIds] });
    }
  }
  return merged;
}

function intersectAllUsers(
  perUser: Map<string, RawWindow[]>,
  userIds: string[]
): MergedWindow[] {
  if (userIds.length === 0) return [];
  let acc: RawWindow[] = perUser.get(userIds[0]) || [];
  for (let i = 1; i < userIds.length; i++) {
    acc = intersectTwo(acc, perUser.get(userIds[i]) || []);
    if (acc.length === 0) return [];
  }
  return acc.map((w) => ({ ...w, userIds: [...userIds] }));
}

function intersectTwo(a: RawWindow[], b: RawWindow[]): RawWindow[] {
  const result: RawWindow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start =
      a[i].start.getTime() > b[j].start.getTime() ? a[i].start : b[j].start;
    const end = a[i].end.getTime() < b[j].end.getTime() ? a[i].end : b[j].end;
    if (start.getTime() < end.getTime()) result.push({ start, end });
    if (a[i].end.getTime() < b[j].end.getTime()) i++;
    else j++;
  }
  return result;
}

function formatDateInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

function guestDayStart(date: string, tz: string): Date {
  return localTimeToUTC(date, "00:00", tz);
}

function guestDayEnd(date: string, tz: string): Date {
  // 23:59 of that day in guest TZ
  return localTimeToUTC(date, "23:59", tz);
}
