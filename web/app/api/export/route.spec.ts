import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthorizedHeadersMock } = vi.hoisted(() => ({
  getAuthorizedHeadersMock: vi.fn(),
}));
vi.mock("@/lib/internal-auth", () => ({
  getAuthorizedHeaders: getAuthorizedHeadersMock,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

beforeEach(() => {
  getAuthorizedHeadersMock.mockReset();
  fetchMock.mockReset();
});

describe("GET /api/export", () => {
  it("streams the CSV with a download Content-Disposition header", async () => {
    getAuthorizedHeadersMock.mockResolvedValue({ Authorization: "Bearer x" });
    fetchMock.mockResolvedValue(
      new Response("date,account,type,amount,category\n2026-09-10,Cont curent,expense,-45.30,Groceries", {
        status: 200,
      })
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="saldovio-transactions.csv"'
    );
    const body = await response.text();
    expect(body).toContain("date,account,type,amount,category");
  });

  it("returns 401 when the caller is not authenticated", async () => {
    getAuthorizedHeadersMock.mockRejectedValue(new Error("Not authenticated"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes through a Finance API error status", async () => {
    getAuthorizedHeadersMock.mockResolvedValue({ Authorization: "Bearer x" });
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
