import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
  jsonb,
  time,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccount } from "next-auth/adapters";

// ========== ENUMS ==========

export const schedulingModeEnum = pgEnum("scheduling_mode", [
  "any_available",
  "all_available",
  "specific_person",
]);

export const meetingPlatformEnum = pgEnum("meeting_platform", [
  "google_meet",
  "zoom",
  "none",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "cancelled",
  "rescheduled",
]);

export const dayOfWeekEnum = pgEnum("day_of_week", [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

// ========== AUTH.JS TABLES ==========

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  username: varchar("username", { length: 64 }).unique(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Tokyo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ========== APPLICATION TABLES ==========

export const eventTypes = pgTable(
  "event_type",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    meetingPlatform: meetingPlatformEnum("meeting_platform")
      .notNull()
      .default("google_meet"),
    schedulingMode: schedulingModeEnum("scheduling_mode")
      .notNull()
      .default("specific_person"),
    color: varchar("color", { length: 7 }).default("#6366f1"),
    isActive: boolean("is_active").notNull().default(true),
    bufferBeforeMinutes: integer("buffer_before_minutes").default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").default(0),
    minNoticeMinutes: integer("min_notice_minutes").default(60),
    maxAdvanceDays: integer("max_advance_days").default(60),
    customQuestions: jsonb("custom_questions").$type<
      Array<{ id: string; question: string; required: boolean }>
    >(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("event_type_user_slug_idx").on(table.userId, table.slug),
  ]
);

export const eventTypeMembers = pgTable(
  "event_type_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isRequired: boolean("is_required").notNull().default(true),
  },
  (table) => [
    uniqueIndex("event_member_unique_idx").on(table.eventTypeId, table.userId),
  ]
);

export const availabilitySchedules = pgTable("availability_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull().default("Default"),
  isDefault: boolean("is_default").notNull().default(true),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Tokyo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const availabilityRules = pgTable("availability_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => availabilitySchedules.id, { onDelete: "cascade" }),
  dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
});

export const availabilityOverrides = pgTable("availability_override", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date", { mode: "date" }).notNull(),
  startTime: time("start_time"),
  endTime: time("end_time"),
  isBlocked: boolean("is_blocked").notNull().default(false),
});

export const bookings = pgTable("booking", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventTypeId: uuid("event_type_id")
    .notNull()
    .references(() => eventTypes.id, { onDelete: "cascade" }),
  assignedUserId: text("assigned_user_id").references(() => users.id),
  guestName: varchar("guest_name", { length: 255 }).notNull(),
  guestEmail: varchar("guest_email", { length: 320 }).notNull(),
  guestNotes: text("guest_notes"),
  guestTimezone: varchar("guest_timezone", { length: 64 }).notNull(),
  guestAnswers: jsonb("guest_answers").$type<
    Array<{ questionId: string; answer: string }>
  >(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  meetingPlatform: meetingPlatformEnum("meeting_platform"),
  meetingUrl: text("meeting_url"),
  meetingId: text("meeting_id"),
  googleCalendarEventId: text("google_calendar_event_id"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ========== RELATIONS ==========

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  eventTypes: many(eventTypes),
  eventTypeMemberships: many(eventTypeMembers),
  availabilitySchedules: many(availabilitySchedules),
  availabilityOverrides: many(availabilityOverrides),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const eventTypesRelations = relations(eventTypes, ({ one, many }) => ({
  owner: one(users, {
    fields: [eventTypes.userId],
    references: [users.id],
  }),
  members: many(eventTypeMembers),
  bookings: many(bookings),
}));

export const eventTypeMembersRelations = relations(
  eventTypeMembers,
  ({ one }) => ({
    eventType: one(eventTypes, {
      fields: [eventTypeMembers.eventTypeId],
      references: [eventTypes.id],
    }),
    user: one(users, {
      fields: [eventTypeMembers.userId],
      references: [users.id],
    }),
  })
);

export const availabilitySchedulesRelations = relations(
  availabilitySchedules,
  ({ one, many }) => ({
    user: one(users, {
      fields: [availabilitySchedules.userId],
      references: [users.id],
    }),
    rules: many(availabilityRules),
  })
);

export const availabilityRulesRelations = relations(
  availabilityRules,
  ({ one }) => ({
    schedule: one(availabilitySchedules, {
      fields: [availabilityRules.scheduleId],
      references: [availabilitySchedules.id],
    }),
  })
);

export const availabilityOverridesRelations = relations(
  availabilityOverrides,
  ({ one }) => ({
    user: one(users, {
      fields: [availabilityOverrides.userId],
      references: [users.id],
    }),
  })
);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  eventType: one(eventTypes, {
    fields: [bookings.eventTypeId],
    references: [eventTypes.id],
  }),
  assignedUser: one(users, {
    fields: [bookings.assignedUserId],
    references: [users.id],
  }),
}));
