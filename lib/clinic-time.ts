export function clinicClock(now = new Date()) {
  const local = new Date(now.getTime() - 6 * 3600000);
  return {
    day: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  };
}
function easter(year: number) {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(
    Date.UTC(
      year,
      Math.floor((h + l - 7 * m + 114) / 31) - 1,
      ((h + l - 7 * m + 114) % 31) + 1,
    ),
  );
}
export function holidays(year: number, extra = "") {
  const dates = [
    "01-01",
    "05-01",
    "07-19",
    "09-14",
    "09-15",
    "12-08",
    "12-25",
  ].map((d) => `${year}-${d}`);
  const sunday = easter(year);
  for (const offset of [-3, -2])
    dates.push(
      new Date(sunday.getTime() + offset * 86400000).toISOString().slice(0, 10),
    );
  return new Set([
    ...dates,
    ...extra.split(/[\s,;]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  ]);
}
export function isWorkingDay(day: string, extra = "") {
  const date = new Date(day + "T12:00:00Z");
  const weekday = date.getUTCDay();
  return (
    weekday >= 1 &&
    weekday <= 5 &&
    !holidays(date.getUTCFullYear(), extra).has(day)
  );
}
export function lastWorkingDay(month: string, extra = "") {
  const [year, m] = month.split("-").map(Number);
  let date = new Date(Date.UTC(year, m, 0));
  while (!isWorkingDay(date.toISOString().slice(0, 10), extra))
    date = new Date(date.getTime() - 86400000);
  return date.toISOString().slice(0, 10);
}
