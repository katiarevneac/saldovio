import { z } from "zod";

export const CreateAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  currentBalance: z.coerce.number({ message: "Starting balance must be a number" }),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "As of date must be in YYYY-MM-DD format"),
});

// Same fields as CreateAccountSchema — completing an unconfigured
// account's setup takes the same inputs a fresh account would (Epic 14
// Sprint 2 Story 6). Kept as its own named export, not a bare alias, so
// the two can diverge independently if the update path ever needs to
// (e.g. dropping referenceDate once an account is configured).
export const UpdateAccountSchema = CreateAccountSchema;
