import { FINANCE_API_URL } from "@/lib/config";
import { getAuthorizedHeaders } from "@/lib/internal-auth";

export async function GET() {
  let headers: HeadersInit;
  try {
    headers = await getAuthorizedHeaders();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const response = await fetch(`${FINANCE_API_URL}/transactions/export`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    return new Response("Could not export transactions", { status: response.status });
  }

  const csv = await response.text();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="saldovio-transactions.csv"',
    },
  });
}
