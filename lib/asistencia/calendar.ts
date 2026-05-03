// Calendar grid math for the asistencia month view.
// All inputs/outputs are ISO strings (YYYY-MM or YYYY-MM-DD); no Date objects
// cross the boundary, since attendance is anchored to Bogotá-local dates and
// the server runs UTC.

export type DayBucket = "all" | "partial" | "low" | "empty";

const MONTH_ISO_RE = /^(\d{4})-(\d{2})$/;
const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseMonth(monthIso: string): { year: number; month: number } {
  const m = MONTH_ISO_RE.exec(monthIso);
  if (!m) throw new Error(`Invalid monthIso: ${monthIso}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

function parseDate(dateIso: string): { year: number; month: number; day: number } {
  const m = DATE_ISO_RE.exec(dateIso);
  if (!m) throw new Error(`Invalid dateIso: ${dateIso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthOfDate(dateIso: string): string {
  const { year, month } = parseDate(dateIso);
  return `${year}-${pad2(month)}`;
}

export function monthBoundaries(monthIso: string): { start: string; end: string } {
  const { year, month } = parseMonth(monthIso);
  const last = daysInMonth(year, month);
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(last)}`,
  };
}

export function weekdaysInMonth(monthIso: string): string[] {
  const { year, month } = parseMonth(monthIso);
  const last = daysInMonth(year, month);
  const out: string[] = [];
  for (let day = 1; day <= last; day++) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow >= 1 && dow <= 5) {
      out.push(`${year}-${pad2(month)}-${pad2(day)}`);
    }
  }
  return out;
}

// Mon=1 ... Fri=5. Used to position the first cell in the 5-col grid.
export function weekdayIndex(dateIso: string): 1 | 2 | 3 | 4 | 5 | 0 | 6 {
  const { year, month, day } = parseDate(dateIso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function bucketForDay(
  presentCount: number,
  totalStudents: number,
  hasRecords: boolean,
): DayBucket {
  if (!hasRecords || totalStudents === 0) return "empty";
  const pct = presentCount / totalStudents;
  if (pct >= 1) return "all";
  if (pct >= 0.4) return "partial";
  return "low";
}

export function prevMonth(monthIso: string): string {
  const { year, month } = parseMonth(monthIso);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${pad2(month - 1)}`;
}

export function nextMonth(monthIso: string): string {
  const { year, month } = parseMonth(monthIso);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${pad2(month + 1)}`;
}

// Returns null when monthIso is at or beyond the current Bogotá month —
// future months would always be empty so we hide the nav.
export function nextMonthIso(monthIso: string, todayIso: string): string | null {
  const todayMonth = monthOfDate(todayIso);
  if (monthIso >= todayMonth) return null;
  return nextMonth(monthIso);
}
