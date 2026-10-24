import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma } from "./server";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("MiniLedger API", () => {
  it("GET /health returns a healthy response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.database).toBe("connected");
  });

  it("GET /loans rejects requests without a token", async () => {
    const response = await request(app).get("/loans");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  it("POST /loans rejects requests without a token", async () => {
    const response = await request(app).post("/loans").send({
      friendName: "Test Friend",
      amount: 500,
      dueDate: "2026-12-12",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });
});
