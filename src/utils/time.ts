/** Pure time helpers used by the booking engine (kept dependency-free so they are easy to unit test). */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isValidTime = (t: string) => TIME_RE.test(t);

export function isValidDate(d: string): boolean {
  const m = DATE_RE.exec(d);
  if (!m) return false;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, da));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === da;
}

/** "HH:mm" -> minutes since midnight. */
export function toMinutes(t: string): number {
  const m = TIME_RE.exec(t);
  if (!m) throw new Error(`Invalid time: ${t}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd).
 * Back-to-back bookings (one ends exactly when the next starts) do NOT overlap.
 */
export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Current date ("YYYY-MM-DD") and minutes-of-day in a zone expressed as a UTC offset in minutes. */
export function zonedNow(utcOffsetMinutes: number, now: Date = new Date()) {
  const shifted = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/** True when the requested slot starts at or before "now" in the configured zone. */
export function isInPast(date: string, startMinutes: number, utcOffsetMinutes: number, now: Date = new Date()) {
  const cur = zonedNow(utcOffsetMinutes, now);
  if (date < cur.date) return true; // ISO dates compare lexicographically
  if (date === cur.date && startMinutes <= cur.minutes) return true;
  return false;
}
