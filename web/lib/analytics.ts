import "server-only";
import { ANALYTICS_SERVICE_URL, ANALYTICS_API_SECRET } from "./config";
import type { RecurringRule } from "./recurring-rules";

export type DailyBalance = { date: string; balance: string };

export type Forecast = {
  forecastBalance: string;
  calculationDate: string;
  windowEndDate: string;
  formulaVersion: string;
  assumptions: string[];
  dailyBalances: DailyBalance[];
};

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// No internal-auth (per-user) token here — Analytics Service is a
// stateless calculator with no concept of ownership; web/ is the one
// that gathered this user's data from Finance API in the first place.
// The shared secret below only proves the caller is web/'s server,
// not a public unauthenticated request — a separate concern from
// per-user auth, and a separate secret from finance-api's
// INTERNAL_API_SECRET.
export async function getForecast(
  currentBalance: string,
  recurringRules: RecurringRule[],
  windowEndDate: string
): Promise<Forecast> {
  const response = await fetch(`${ANALYTICS_SERVICE_URL}/forecast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Analytics-Secret": ANALYTICS_API_SECRET,
    },
    cache: "no-store",
    body: JSON.stringify({
      currentBalance,
      recurringRules: recurringRules.map((rule) => ({
        type: rule.type,
        amount: rule.amount,
        dayOfMonth: rule.day_of_month,
      })),
      calculationDate: todayDateString(),
      windowEndDate,
    }),
  });

  if (!response.ok) {
    throw new Error(`Analytics Service returned ${response.status}`);
  }

  return response.json();
}
