import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password security", () => {
  it("hashes passwords with unique salts and verifies safely", async () => {
    const first = await hashPassword("000000");
    const second = await hashPassword("000000");
    expect(first).not.toBe(second);
    expect(first).not.toContain("000000");
    await expect(verifyPassword("000000", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", first)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("000000", "invalid")).resolves.toBe(false);
  });
});
