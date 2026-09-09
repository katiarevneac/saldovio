import "server-only";
import { ANALYTICS_SERVICE_URL } from "./config";
import type { RecurringRule } from "./recurring-rules";

export type Forecast = {
  forecastBalance: string;
  calculationDate: string;
  windowEndDate: string;
  formulaVersion: string;
  assumptions: string[];
};

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// No internal-auth token here — Analytics Service is a stateless
// calculator with no concept of ownership; web/ is the one that
// gathered this user's data from Finance API in the first place.
export async function getForecast(
  currentBalance: string,
  recurringRules: RecurringRule[]
): Promise<Forecast> {
  const response = await fetch(`${ANALYTICS_SERVICE_URL}/forecast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      currentBalance,
      recurringRules: recurringRules.map((rule) => ({
        type: rule.type,
        amount: rule.amount,
        dayOfMonth: rule.day_of_month,
      })),
      calculationDate: todayDateString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Analytics Service returned ${response.status}`);
  }

  return response.json();
}
