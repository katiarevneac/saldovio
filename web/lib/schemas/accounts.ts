import { z } from "zod";

export const CreateAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  currentBalance: z.coerce.number({ message: "Starting balance must be a number" }),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "As of date must be in YYYY-MM-DD format"),
});
