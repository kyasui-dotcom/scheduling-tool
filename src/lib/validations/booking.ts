import { z } from "zod";

export const createBookingSchema = z.object({
  eventTypeId: z.string().uuid(),
  startTime: z.string().datetime(),
  guestCompanyName: z.string().min(1, "社名は必須です").max(255),
  guestName: z.string().min(1, "担当者名は必須です").max(255),
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
