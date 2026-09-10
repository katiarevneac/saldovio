import { z } from "zod";

export const CreateRecurringRuleSchema = z.object({
  accountId: z.coerce.number().int(),
  type: z.enum(["expense", "income"]),
  amount: z.coerce.number().positive("Amount must be positive"),
  dayOfMonth: z.coerce
    .number()
    .int()
    .min(1, "Day of month must be between 1 and 31")
    .max(31, "Day of month must be between 1 and 31"),
  category: z.string().optional(),
});
