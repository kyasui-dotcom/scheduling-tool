import { z } from "zod";

export const createEventTypeSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  meetingPlatform: z.enum(["google_meet", "zoom", "none"]),
  schedulingMode: z.enum(["any_available", "all_available", "specific_person"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  memberUserIds: z.array(z.string()).optional(),
});

export const updateEventTypeSchema = createEventTypeSchema.partial();
