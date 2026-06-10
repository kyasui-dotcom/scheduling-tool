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

  const members = await db
    .select({ userId: eventTypeMembers.userId })
    .from(eventTypeMembers)
    .where(eq(eventTypeMembers.eventTypeId, params.eventTypeId));

  const memberUserIds =
    members.length > 0 ? members.map((m) => m.userId) : [eventType.userId];

  return computeAvailability({
    memberUserIds,
    eventTypeId: params.eventTypeId,
    date: params.date,
    guestTimezone: params.guestTimezone,
    slotMode: eventType.slotMode ?? "fixed_slots",
    durationMinutes: eventType.durationMinutes,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes || 0,
    bufferAfterMinutes: eventType.bufferAfterMinutes || 0,
    minNoticeMinutes: eventType.minNoticeMinutes || 0,
    maxAdvanceDays: eventType.maxAdvanceDays || 60,
    schedulingMode: eventType.schedulingMode,
  });
}

/**
 * Compute availability from raw config (no saved event_type required).
 * Used by preview UI on the event setup screen.
 */
export async function getAvailabilityFromConfig(params: {
  memberUserIds: string[];
  date: string;
  guestTimezone: string;
  slotMode: SlotMode;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  schedulingMode: "any_available" | "all_available" | "specific_person";
  excludeEventTypeId?: string;
}): Promise<AvailabilityResult> {
  return computeAvailability({
    memberUserIds: params.memberUserIds,
    eventTypeId: params.excludeEventTypeId ?? null,
    date: params.date,
    guestTimezone: params.guestTimezone,
    slotMode: params.slotMode,
    durationMinutes: params.durationMinutes,
    bufferBeforeMinutes: params.bufferBeforeMinutes ?? 0,
    bufferAfterMinutes: params.bufferAfterMinutes ?? 0,
    minNoticeMinutes: params.minNoticeMinutes ?? 0,
    maxAdvanceDays: params.maxAdvanceDays ?? 60,
    schedulingMode: params.schedulingMode,
  });
}

async function computeAvailability(params: {
  memberUserIds: string[];
  eventTypeId: string | null;
  date: string;
  guestTimezone: string;
  slotMode: SlotMode;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  schedulingMode: string;
}): Promise<AvailabilityResult> {
  const mode = params.slotMode;
  const memberUserIds = params.memberUserIds;

  const perUserWindows = await computePerUserWindows({
    userIds: memberUserIds,
    eventTypeId: params.eventTypeId,
    date: params.date,
    durationMinutes: params.durationMinutes,
    bufferBeforeMinutes: params.bufferBeforeMinutes,
    bufferAfterMinutes: params.bufferAfterMinutes,
    schedulingMode: params.schedulingMode,
  });

  let merged: MergedWindow[];
  switch (params.schedulingMode) {
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

  const now = new Date();
  const minNotice = addMinutes(now, params.minNoticeMinutes);
  const maxAdvance = addDays(now, params.maxAdvanceDays);
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
      const latestStart = addMinutes(w.end, -params.durationMinutes);
      if (latestStart.getTime() < w.start.getTime()) continue;
      if (!inGuestDate(w.start) && !inGuestDate(latestStart)) continue;
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

  const slots: TimeSlot[] = [];
  for (const w of merged) {
    let slotStart = w.start;
    while (
      addMinutes(slotStart, params.durationMinutes).getTime() <=
      w.end.getTime()
    ) {
      const slotEnd = addMinutes(slotStart, params.durationMinutes);
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

/**
 * Multi-day variant for a saved event type.
 * Loads event_type + members once, then delegates to the batched range computation.
 */
export async function getAvailabilityRange(params: {
  eventTypeId: string;
  startDate: string;
  days: number;
  guestTimezone: string;
}): Promise<Array<AvailabilityResult & { date: string }>> {
  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, params.eventTypeId));
  if (!eventType || !eventType.isActive) return [];

  const members = await db
    .select({ userId: eventTypeMembers.userId })
    .from(eventTypeMembers)
    .where(eq(eventTypeMembers.eventTypeId, params.eventTypeId));

  const memberUserIds =
    members.length > 0 ? members.map((m) => m.userId) : [eventType.userId];

  return getAvailabilityRangeFromConfig({
    memberUserIds,
    startDate: params.startDate,
    days: params.days,
    guestTimezone: params.guestTimezone,
    slotMode: eventType.slotMode ?? "fixed_slots",
    durationMinutes: eventType.durationMinutes,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes || 0,
    bufferAfterMinutes: eventType.bufferAfterMinutes || 0,
    minNoticeMinutes: eventType.minNoticeMinutes || 0,
    maxAdvanceDays: eventType.maxAdvanceDays || 60,
    schedulingMode: eventType.schedulingMode,
    excludeEventTypeId: params.eventTypeId,
  });
}

/**
 * Multi-day variant of getAvailabilityFromConfig.
 * Fetches FreeBusy / schedules / rules / overrides / bookings ONCE for the
 * whole range and computes each day in memory.
 * 7-day preview: ~7x fewer Google API calls per user.
 */
export async function getAvailabilityRangeFromConfig(params: {
  memberUserIds: string[];
  startDate: string;
  days: number;
  guestTimezone: string;
  slotMode: SlotMode;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  schedulingMode: "any_available" | "all_available" | "specific_person";
  excludeEventTypeId?: string;
}): Promise<Array<AvailabilityResult & { date: string }>> {
  const memberUserIds = params.memberUserIds;
  const startDate = new Date(`${params.startDate}T00:00:00Z`);
  const queryStart = addDays(startDate, -1);
  const queryEnd = addDays(startDate, params.days + 1);
  const eventTypeId = params.excludeEventTypeId ?? null;

  // Fetch all data ONCE for the full range
  const [busyData, perUserStatic, allOverrides, allBookings] = await Promise.all([
    getMultiUserFreeBusy(memberUserIds, queryStart.toISOString(), queryEnd.toISOString()),
    fetchPerUserStatic(memberUserIds),
    fetchAllOverrides(memberUserIds, queryStart, queryEnd),
    eventTypeId
      ? db
          .select({
            startTime: bookings.startTime,
            endTime: bookings.endTime,
            assignedUserId: bookings.assignedUserId,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.eventTypeId, eventTypeId),
              eq(bookings.status, "confirmed"),
              gte(bookings.startTime, queryStart),
              lte(bookings.endTime, queryEnd)
            )
          )
      : Promise.resolve(
          [] as Array<{ startTime: Date; endTime: Date; assignedUserId: string | null }>
        ),
  ]);

  const results: Array<AvailabilityResult & { date: string }> = [];
  for (let i = 0; i < params.days; i++) {
    const date = formatDateInTz(addDays(startDate, i), "UTC");
    const perUserWindows = computePerUserWindowsFromCache({
      date,
      memberUserIds,
      perUserStatic,
      allOverrides,
      busyData,
      bookings: allBookings,
      bufferBeforeMinutes: params.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: params.bufferAfterMinutes ?? 0,
      schedulingMode: params.schedulingMode,
    });

    const dayResult = sliceAndAggregate({
      perUserWindows,
      memberUserIds,
      date,
      guestTimezone: params.guestTimezone,
      slotMode: params.slotMode,
      durationMinutes: params.durationMinutes,
      minNoticeMinutes: params.minNoticeMinutes ?? 0,
      maxAdvanceDays: params.maxAdvanceDays ?? 60,
      schedulingMode: params.schedulingMode,
    });
    results.push({ ...dayResult, date });
  }
  return results;
}

interface UserStatic {
  schedule: typeof availabilitySchedules.$inferSelect | null;
  rules: (typeof availabilityRules.$inferSelect)[];
}

async function fetchPerUserStatic(
  userIds: string[]
): Promise<Map<string, UserStatic>> {
  const schedules = await db
    .select()
    .from(availabilitySchedules)
    .where(
      and(
        inArray(availabilitySchedules.userId, userIds),
        eq(availabilitySchedules.isDefault, true)
      )
    );
  const scheduleIds = schedules.map((s) => s.id);
  const rules =
    scheduleIds.length > 0
      ? await db
          .select()
          .from(availabilityRules)
          .where(inArray(availabilityRules.scheduleId, scheduleIds))
      : [];

  const rulesByScheduleId = new Map<
    string,
    (typeof availabilityRules.$inferSelect)[]
  >();
  for (const r of rules) {
    const arr = rulesByScheduleId.get(r.scheduleId) || [];
    arr.push(r);
    rulesByScheduleId.set(r.scheduleId, arr);
  }

  const map = new Map<string, UserStatic>();
  for (const uid of userIds) {
    const schedule = schedules.find((s) => s.userId === uid) || null;
    map.set(uid, {
      schedule,
      rules: schedule ? rulesByScheduleId.get(schedule.id) || [] : [],
    });
  }
  return map;
}

async function fetchAllOverrides(
  userIds: string[],
  start: Date,
  end: Date
): Promise<Map<string, (typeof availabilityOverrides.$inferSelect)[]>> {
  const rows = await db
    .select()
    .from(availabilityOverrides)
    .where(
      and(
        inArray(availabilityOverrides.userId, userIds),
        gte(availabilityOverrides.date, start),
        lte(availabilityOverrides.date, end)
      )
    );
  const map = new Map<
    string,
    (typeof availabilityOverrides.$inferSelect)[]
  >();
  for (const o of rows) {
    const arr = map.get(o.userId) || [];
    arr.push(o);
    map.set(o.userId, arr);
  }
  return map;
}

function computePerUserWindowsFromCache(params: {
  date: string;
  memberUserIds: string[];
  perUserStatic: Map<string, UserStatic>;
  allOverrides: Map<string, (typeof availabilityOverrides.$inferSelect)[]>;
  busyData: Map<string, Array<{ start: string; end: string }>>;
  bookings: Array<{ startTime: Date; endTime: Date; assignedUserId: string | null }>;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  schedulingMode: string;
}): Map<string, RawWindow[]> {
  const dayStartUtc = new Date(`${params.date}T00:00:00Z`);
  const dayEndUtc = new Date(`${params.date}T23:59:59Z`);
  const out = new Map<string, RawWindow[]>();

  for (const uid of params.memberUserIds) {
    const stat = params.perUserStatic.get(uid);
    if (!stat || !stat.schedule) {
      out.set(uid, []);
      continue;
    }
    const dayOverrides = (params.allOverrides.get(uid) || []).filter((o) => {
      const od = o.date;
      return (
        od.getTime() >= startOfDay(dayStartUtc).getTime() &&
        od.getTime() <= endOfDay(dayEndUtc).getTime()
      );
    });
    if (dayOverrides.some((o) => o.isBlocked)) {
      out.set(uid, []);
      continue;
    }
    const dow = getDayOfWeekInTimezone(
      new Date(params.date + "T12:00:00Z"),
      stat.schedule.timezone
    );
    const dayRules = stat.rules.filter((r) => r.dayOfWeek === dow);

    let windows: RawWindow[] = [];
    const overrideTimes = dayOverrides.filter(
      (o) => !o.isBlocked && o.startTime && o.endTime
    );
    if (overrideTimes.length > 0) {
      for (const o of overrideTimes) {
        windows.push({
          start: localTimeToUTC(params.date, o.startTime!, stat.schedule.timezone),
          end: localTimeToUTC(params.date, o.endTime!, stat.schedule.timezone),
        });
      }
    } else {
      for (const r of dayRules) {
        windows.push({
          start: localTimeToUTC(params.date, r.startTime, stat.schedule.timezone),
          end: localTimeToUTC(params.date, r.endTime, stat.schedule.timezone),
        });
      }
    }

    const userBusy = params.busyData.get(uid) || [];
    for (const b of userBusy) {
      const bs = new Date(b.start);
      const be = new Date(b.end);
      if (be < dayStartUtc || bs > dayEndUtc) continue;
      windows = subtractPeriod(windows, bs, be);
    }

    const userBookings = params.bookings.filter(
      (b) =>
        (b.assignedUserId === uid || params.schedulingMode === "all_available") &&
        b.endTime >= dayStartUtc &&
        b.startTime <= dayEndUtc
    );
    for (const b of userBookings) {
      const bs = addMinutes(b.startTime, -params.bufferBeforeMinutes);
      const be = addMinutes(b.endTime, params.bufferAfterMinutes);
      windows = subtractPeriod(windows, bs, be);
    }

    windows.sort((a, b) => a.start.getTime() - b.start.getTime());
    out.set(uid, windows);
  }
  return out;
}

function sliceAndAggregate(params: {
  perUserWindows: Map<string, RawWindow[]>;
  memberUserIds: string[];
  date: string;
  guestTimezone: string;
  slotMode: SlotMode;
  durationMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  schedulingMode: string;
}): AvailabilityResult {
  let merged: MergedWindow[];
  switch (params.schedulingMode) {
    case "all_available":
      merged = intersectAllUsers(params.perUserWindows, params.memberUserIds);
      break;
    case "any_available":
      merged = unionWithUsers(params.perUserWindows);
      break;
    case "specific_person":
    default: {
      const uid = params.memberUserIds[0];
      merged = (params.perUserWindows.get(uid) || []).map((w) => ({
        ...w,
        userIds: [uid],
      }));
      break;
    }
  }

  const now = new Date();
  const minNotice = addMinutes(now, params.minNoticeMinutes);
  const maxAdvance = addDays(now, params.maxAdvanceDays);
  merged = merged
    .map((w) => ({
      start: w.start.getTime() < minNotice.getTime() ? minNotice : w.start,
      end: w.end.getTime() > maxAdvance.getTime() ? maxAdvance : w.end,
      userIds: w.userIds,
    }))
    .filter((w) => w.start.getTime() < w.end.getTime());

  const inGuestDate = (d: Date) =>
    formatDateInTz(d, params.guestTimezone) === params.date;

  if (params.slotMode === "flexible_start") {
    const windows: FlexibleWindow[] = [];
    for (const w of merged) {
      const latestStart = addMinutes(w.end, -params.durationMinutes);
      if (latestStart.getTime() < w.start.getTime()) continue;
      if (!inGuestDate(w.start) && !inGuestDate(latestStart)) continue;
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
    return { mode: "flexible_start", slots: [], windows };
  }

  const slots: TimeSlot[] = [];
  for (const w of merged) {
    let slotStart = w.start;
    while (
      addMinutes(slotStart, params.durationMinutes).getTime() <=
      w.end.getTime()
    ) {
      const slotEnd = addMinutes(slotStart, params.durationMinutes);
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
  return { mode: "fixed_slots", slots, windows: [] };
}

// ----- helpers -----

async function computePerUserWindows(params: {
  userIds: string[];
  eventTypeId: string | null;
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

  const existingBookings = params.eventTypeId
    ? await db
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
        )
    : [];

  // Batch fetch schedules/rules/overrides for all users in parallel
  const [perUserStatic, allOverrides] = await Promise.all([
    fetchPerUserStatic(params.userIds),
    fetchAllOverrides(
      params.userIds,
      startOfDay(new Date(params.date)),
      endOfDay(new Date(params.date))
    ),
  ]);

  return computePerUserWindowsFromCache({
    date: params.date,
    memberUserIds: params.userIds,
    perUserStatic,
    allOverrides,
    busyData,
    bookings: existingBookings,
    bufferBeforeMinutes: params.bufferBeforeMinutes,
    bufferAfterMinutes: params.bufferAfterMinutes,
    schedulingMode: params.schedulingMode,
  });
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
