import { z } from "zod";

export const createExportTaskSchema = z.object({
  name: z.string().min(1).max(255),
  spreadsheetUrl: z
    .string()
    .url()
    .refine((s) => /docs\.google\.com\/spreadsheets\/d\//.test(s), {
      message: "Google Sheets の URL を指定してください",
    }),
  sheetName: z.string().max(128).nullable().optional(),
  eventTypeId: z.string().uuid().nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  status: z.enum(["confirmed", "cancelled", "all"]).default("confirmed"),
  daysBack: z.number().int().min(1).max(3650).nullable().optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  includeHeader: z.boolean().default(false),
});

export const updateExportTaskSchema = createExportTaskSchema.partial();
