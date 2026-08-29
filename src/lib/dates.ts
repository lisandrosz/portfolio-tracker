/**
 * The calendar this portfolio lives on.
 *
 * Every "today" in the app has to agree, and the two machines that compute it
 * don't share a clock: the browser runs in Buenos Aires, the server runs in UTC
 * on Vercel. `new Date().toISOString()` picks UTC, which from 21:00 local onward
 * already reads as tomorrow — so an order loaded at night was dated a day ahead,
 * the daily snapshot was stamped with a day that hadn't started, and a rate
 * lookup for "today" fell through to the historical branch.
 *
 * Pinning the zone instead of reading the machine's makes client and server
 * produce the same answer no matter where either one is running.
 */
export const PORTFOLIO_TZ = "America/Argentina/Buenos_Aires";

/** Today in the portfolio's timezone, as YYYY-MM-DD. */
export function today(): string {
  // en-CA formats as YYYY-MM-DD, which is also how dates are stored.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PORTFOLIO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The current year and month in the portfolio's timezone, as YYYY-MM. */
export function currentMonth(): string {
  return today().slice(0, 7);
}

/**
 * `days` before `from` (default today), as YYYY-MM-DD.
 *
 * Plain arithmetic on an already-resolved date string: UTC here is just a way to
 * step whole days without a DST hour knocking the result onto the wrong date.
 */
export function daysAgo(days: number, from: string = today()): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}
