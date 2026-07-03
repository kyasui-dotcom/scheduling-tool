import { z } from "zod";

export const questionTypeEnum = z.enum([
  "text",
  "textarea",
  "radio",
  "checkbox",
  "select",
  "phone",
  "number",
]);

export type QuestionType = z.infer<typeof questionTypeEnum>;

export const customQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  type: questionTypeEnum.default("text"),
  required: z.boolean(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(), // for radio, checkbox, select
});

export type CustomQuestion = z.infer<typeof customQuestionSchema>;

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
  slotMode: z.enum(["fixed_slots", "flexible_start"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  bookingWindowStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  bookingWindowEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  calendarTitleFormat: z.string().min(1).max(255).optional(),
  businessHours: z
    .array(
      z.object({
        dayOfWeek: z.enum([
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ]),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .nullable()
    .optional(),
  spreadsheetUrl: z
    .string()
    .url()
    .refine((s) => /docs\.google\.com\/spreadsheets\/d\//.test(s), {
      message: "Google Sheets の URL を指定してください",
    })
    .nullable()
    .optional()
    .or(z.literal("")),
  ownerUserId: z.string().optional(),
  memberUserIds: z.array(z.string()).optional(),
  customQuestions: z.array(customQuestionSchema).optional(),
});

export const updateEventTypeSchema = createEventTypeSchema.partial();
