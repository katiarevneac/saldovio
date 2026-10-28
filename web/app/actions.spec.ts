import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/internal-auth", () => ({
  getAuthorizedHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })),
}));

import { createTransferAction } from "./actions";

const input = {
  sourceAccountId: 1,
  destinationAccountId: 2,
  amount: 50,
  occurredOn: "2026-10-01",
  category: "Savings",
};

describe("createTransferAction", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts the input to /transactions/transfer with auth headers", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
    await expect(createTransferAction(input)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/transactions/transfer");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("surfaces the API error message", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Account is archived" }), { status: 400 }),
    );
    await expect(createTransferAction(input)).rejects.toThrow("Account is archived");
  });
});
