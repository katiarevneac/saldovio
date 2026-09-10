import { z } from "zod";

export const CreateTransactionSchema = z.object({
  accountId: z.number().int(),
  type: z.enum(["expense", "income"]),
  amount: z.number(),
  occurredOn: z
    .string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  category: z.string().optional(),
});
