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

export const CreateTransferSchema = z
  .object({
    sourceAccountId: z.number().int(),
    destinationAccountId: z.number().int(),
    amount: z.number().gt(0, "Amount must be greater than zero"),
    occurredOn: z
      .string()
      .min(1, "Date is required")
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    category: z.string().optional(),
  })
  .refine((v) => v.sourceAccountId !== v.destinationAccountId, {
    message: "Choose two different accounts",
    path: ["destinationAccountId"],
  });

export type CreateTransferInput = z.infer<typeof CreateTransferSchema>;
