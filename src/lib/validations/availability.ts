import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const availabilityRuleSchema = z.object({
  dayOfWeek: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  startTime: z.string().regex(timeRegex, "Format: HH:MM"),
  endTime: z.string().regex(timeRegex, "Format: HH:MM"),
});

export const updateAvailabilitySchema = z.object({
  timezone: z.string().min(1),
  rules: z.array(availabilityRuleSchema),
});
