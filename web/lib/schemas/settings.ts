import { z } from "zod";

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

export const UpdateSettingsSchema = z.object({
  essentialSpend: z.preprocess(
    blankToNull,
    z.coerce.number().nonnegative("Essential spend must be zero or more").nullable()
  ),
  payday: z.preprocess(
    blankToNull,
    z.coerce
      .number()
      .int()
      .min(1, "Payday must be between 1 and 31")
      .max(31, "Payday must be between 1 and 31")
      .nullable()
  ),
  // 365 matches finance-api's UpdateSettingsSchema ceiling exactly (Epic 11
  // Story 1), which is also enforced by Analytics Service and a Postgres
  // CHECK constraint — this client-side copy must never drift from it.
  horizonDays: z.coerce
    .number()
    .int()
    .min(1, "Horizon must be at least 1 day")
    .max(365, "Horizon can be at most 365 days"),
});

export const DeleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
