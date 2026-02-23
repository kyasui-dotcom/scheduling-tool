import { db } from "@/lib/db";
import {
  eventTypes,
  eventTypeMembers,
  availabilitySchedules,
  availabilityRules,
  availabilityOverrides,
  bookings,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { getMultiUserFreeBusy } from "@/lib/google-calendar";
import { addMinutes, startOfDay, endOfDay, isBefore, isAfter, addDays } from "date-fns";
import { localTimeToUTC, getDayOfWeekInTimezone } from "@/lib/timezone";

export interface TimeSlot {
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  availableUserIds?: string[];
}

interface AvailabilityWindow {
  start: Date;
  end: Date;
}

export async function getAvailableSlots(params: {
  eventTypeId: string;
  date: string; // YYYY-MM-DD
  guestTimezone: string;
}): Promise<TimeSlot[]> {
  // 1. Load event type with members
  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, params.eventTypeId));

  if (!eventType || !eventType.isActive) return [];

  // 2. Determine relevant users
  const members = await db
    .select({ userId: eventTypeMembers.userId })
    .from(eventTypeMembers)
    .where(eq(eventTypeMembers.eventTypeId, params.eventTypeId));

  const memberUserIds =
    members.length > 0 ? members.map((m) => m.userId) : [eventType.userId];

  // 3. For each user, compute their available windows
  const dayStart = new Date(`${params.date}T00:00:00Z`);
  const dayEnd = new Date(`${params.date}T23:59:59Z`);
  // Expand window by 1 day on each side for timezone edge cases
  const queryStart = addDays(dayStart, -1);
  const queryEnd = addDays(dayEnd, 1);

  const perUserSlots = new Map<string, TimeSlot[]>();

  // 4. Get Google Calendar busy data for all users
  const busyData = await getMultiUserFreeBusy(
    memberUserIds,
    queryStart.toISOString(),
    queryEnd.toISOString()
  );

  // 5. Get existing bookings from DB
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

  for (const userId of memberUserIds) {
    // Load user's availability schedule
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
      perUserSlots.set(userId, []);
      continue;
    }

    // Load rules
    const rules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.scheduleId, schedule.id));

    // Load overrides for the target date
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

    // Check if date is blocked
    const isBlocked = overrides.some((o) => o.isBlocked);
    if (isBlocked) {
      perUserSlots.set(userId, []);
      continue;
    }

    // Generate windows from rules for the target date
    const dayOfWeek = getDayOfWeekInTimezone(
      new Date(params.date + "T12:00:00Z"),
      schedule.timezone
    );
    const dayRules = rules.filter((r) => r.dayOfWeek === dayOfWeek);

    let windows: AvailabilityWindow[] = [];

    if (overrides.length > 0 && overrides.some((o) => !o.isBlocked && o.startTime && o.endTime)) {
      // Use override times instead of regular rules
      for (const override of overrides) {
        if (!override.isBlocked && override.startTime && override.endTime) {
          const start = localTimeToUTC(params.date, override.startTime, schedule.timezone);
          const end = localTimeToUTC(params.date, override.endTime, schedule.timezone);
          windows.push({ start, end });
        }
      }
    } else {
      // Use regular rules
      for (const rule of dayRules) {
        const start = localTimeToUTC(params.date, rule.startTime, schedule.timezone);
        const end = localTimeToUTC(params.date, rule.endTime, schedule.timezone);
        windows.push({ start, end });
      }
    }

    // Subtract busy periods from Google Calendar
    const userBusy = busyData.get(userId) || [];
    for (const busy of userBusy) {
      windows = subtractPeriod(
        windows,
        new Date(busy.start),
        new Date(busy.end)
      );
    }

    // Subtract existing bookings (with buffer)
    const userBookings = existingBookings.filter(
      (b) => b.assignedUserId === userId || eventType.schedulingMode === "all_available"
    );
    for (const booking of userBookings) {
      const bufferStart = addMinutes(
        booking.startTime,
        -(eventType.bufferBeforeMinutes || 0)
      );
      const bufferEnd = addMinutes(
        booking.endTime,
        eventType.bufferAfterMinutes || 0
      );
      windows = subtractPeriod(windows, bufferStart, bufferEnd);
    }

    // Slice windows into slots
    const slots: TimeSlot[] = [];
    const now = new Date();
    const minNotice = addMinutes(now, eventType.minNoticeMinutes || 0);
    const maxAdvance = addDays(now, eventType.maxAdvanceDays || 60);

    for (const window of windows) {
      let slotStart = window.start;
      while (
        addMinutes(slotStart, eventType.durationMinutes).getTime() <=
        window.end.getTime()
      ) {
        const slotEnd = addMinutes(slotStart, eventType.durationMinutes);

        // Apply constraints
        if (
          !isBefore(slotStart, minNotice) &&
          !isAfter(slotStart, maxAdvance)
        ) {
          slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            availableUserIds: [userId],
          });
        }

        slotStart = slotEnd;
      }
    }

    perUserSlots.set(userId, slots);
  }

  // 6. Apply scheduling mode
  let finalSlots: TimeSlot[];

  switch (eventType.schedulingMode) {
    case "any_available": {
      // Union: slot is available if ANY user has it
      const slotMap = new Map<
        string,
        { slot: TimeSlot; availableUsers: string[] }
      >();
      for (const [userId, slots] of perUserSlots) {
        for (const slot of slots) {
          const key = slot.startTime;
          if (slotMap.has(key)) {
            slotMap.get(key)!.availableUsers.push(userId);
          } else {
            slotMap.set(key, {
              slot,
              availableUsers: [userId],
            });
          }
        }
      }
      finalSlots = Array.from(slotMap.values()).map((v) => ({
        ...v.slot,
        availableUserIds: v.availableUsers,
      }));
      break;
    }
    case "all_available": {
      // Intersection: slot available only if ALL users have it
      const slotCounts = new Map<string, { count: number; slot: TimeSlot }>();
      for (const [, slots] of perUserSlots) {
        for (const slot of slots) {
          const key = slot.startTime;
          if (slotCounts.has(key)) {
            slotCounts.get(key)!.count++;
          } else {
            slotCounts.set(key, { count: 1, slot });
          }
        }
      }
      finalSlots = Array.from(slotCounts.values())
        .filter((v) => v.count === memberUserIds.length)
        .map((v) => ({
          ...v.slot,
          availableUserIds: memberUserIds,
        }));
      break;
    }
    case "specific_person":
    default: {
      // Just the specific user's slots
      const allSlots: TimeSlot[] = [];
      for (const [, slots] of perUserSlots) {
        allSlots.push(...slots);
      }
      finalSlots = allSlots;
      break;
    }
  }

  // Sort by start time
  finalSlots.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // Filter slots that actually fall on the requested date (in guest's timezone)
  return finalSlots.filter((slot) => {
    const slotDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: params.guestTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date(slot.startTime))
      .replace(/\//g, "-");
    // en-CA format is YYYY-MM-DD
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: params.guestTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(slot.startTime));
    const year = parts.find((p) => p.type === "year")!.value;
    const month = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    const formattedDate = `${year}-${month}-${day}`;
    return formattedDate === params.date;
  });
}

/**
 * Select the best user to assign for "any_available" mode using round-robin
 */
export async function selectAssignee(
  availableUserIds: string[],
  eventTypeId: string
): Promise<string> {
  if (availableUserIds.length === 1) return availableUserIds[0];

  const bookingCounts = await db
    .select({
      userId: bookings.assignedUserId,
    })
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
    if (b.userId) {
      countMap.set(b.userId, (countMap.get(b.userId) || 0) + 1);
    }
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
 * Subtract a busy period from a list of availability windows
 */
function subtractPeriod(
  windows: AvailabilityWindow[],
  busyStart: Date,
  busyEnd: Date
): AvailabilityWindow[] {
  const result: AvailabilityWindow[] = [];

  for (const window of windows) {
    // No overlap
    if (busyEnd <= window.start || busyStart >= window.end) {
      result.push(window);
      continue;
    }

    // Busy period covers the entire window
    if (busyStart <= window.start && busyEnd >= window.end) {
      continue;
    }

    // Busy period splits the window
    if (busyStart > window.start) {
      result.push({ start: window.start, end: busyStart });
    }
    if (busyEnd < window.end) {
      result.push({ start: busyEnd, end: window.end });
    }
  }

  return result;
}
