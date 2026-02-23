import { z } from "zod";

export const createBookingSchema = z.object({
  eventTypeId: z.string().uuid(),
  startTime: z.string().datetime(),
  guestName: z.string().min(1).max(255),
  guestEmail: z.string().email().max(320),
  guestTimezone: z.string().min(1),
  guestNotes: z.string().max(1000).optional(),
  guestAnswers: z
    .array(
      z.object({
        questionId: z.string(),
        answer: z.string(),
      })
    )
    .optional(),
});
