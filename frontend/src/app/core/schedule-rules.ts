// Scheduling guardrails: "Keine Rollouts an Freitagen oder vor Berner
// Feiertagen." Pure date helpers used to warn (non-blocking) before a rollout
// is scheduled on a Friday, a Bernese (Canton Bern) public holiday, or the day
// before one.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function key(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Anonymous Gregorian (Meeus/Jones/Butcher) Easter Sunday for a given year. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Canton-Bern public holidays for a year, keyed YYYY-MM-DD → name. */
export function bernHolidays(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const map = new Map<string, string>();
  const add = (d: Date, name: string) => map.set(key(d), name);

  add(new Date(year, 0, 1), 'Neujahr');
  add(new Date(year, 0, 2), 'Berchtoldstag');
  add(addDaysLocal(easter, -2), 'Karfreitag');
  add(addDaysLocal(easter, 1), 'Ostermontag');
  add(addDaysLocal(easter, 39), 'Auffahrt');
  add(addDaysLocal(easter, 50), 'Pfingstmontag');
  add(new Date(year, 7, 1), 'Bundesfeier');
  add(new Date(year, 11, 25), 'Weihnachten');
  add(new Date(year, 11, 26), 'Stephanstag');
  return map;
}

/**
 * Returns human-readable warnings if the date is a Friday, a Bernese holiday,
 * or the day before one. Empty array = the date is fine to schedule.
 */
export function scheduleWarnings(d: Date): string[] {
  const out: string[] = [];
  const holidays = bernHolidays(d.getFullYear());

  if (d.getDay() === 5) {
    out.push('Freitag — keine Rollouts an Freitagen');
  }
  const today = holidays.get(key(d));
  if (today) {
    out.push(`Berner Feiertag: ${today}`);
  }
  const next = holidays.get(key(addDaysLocal(d, 1)));
  if (next) {
    out.push(`Tag vor Berner Feiertag (${next})`);
  }
  return out;
}
