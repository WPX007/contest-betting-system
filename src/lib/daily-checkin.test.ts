import { describe, expect, it } from "vitest";
import { dailyCheckinDay } from "./daily-checkin";

describe("daily check-in calendar", () => {
  it("allows Monday through Friday in Shanghai", () => {
    expect(dailyCheckinDay(new Date("2026-10-19T02:00:00Z"))).toEqual({ dayKey: "2026-10-19", eligible: true });
    expect(dailyCheckinDay(new Date("2026-10-23T15:59:59Z"))).toEqual({ dayKey: "2026-10-23", eligible: true });
  });

  it("blocks weekends and switches days at Shanghai midnight", () => {
    expect(dailyCheckinDay(new Date("2026-10-23T16:00:00Z"))).toEqual({ dayKey: "2026-10-24", eligible: false });
    expect(dailyCheckinDay(new Date("2026-10-25T02:00:00Z"))).toEqual({ dayKey: "2026-10-25", eligible: false });
  });
});
