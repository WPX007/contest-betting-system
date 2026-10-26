const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function dailyCheckinDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dayKey: `${value("year")}-${value("month")}-${value("day")}`,
    eligible: ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(value("weekday")),
  };
}
