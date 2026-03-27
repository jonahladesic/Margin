export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysToDate(dateStr: string, days: number): Date {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function generateRecurrenceDates(startDate: string, rule: string, weeks: number = 12): string[] {
  const dates: string[] = [];
  const endDate = addDaysToDate(startDate, weeks * 7);

  if (rule === "daily") {
    for (let i = 1; ; i++) {
      const d = addDaysToDate(startDate, i);
      if (d > endDate) break;
      dates.push(fmtDate(d));
    }
  } else if (rule === "weekdays") {
    for (let i = 1; ; i++) {
      const d = addDaysToDate(startDate, i);
      if (d > endDate) break;
      const dow = d.getUTCDay();
      if (dow >= 1 && dow <= 5) dates.push(fmtDate(d));
    }
  } else if (rule === "weekly") {
    for (let i = 7; ; i += 7) {
      const d = addDaysToDate(startDate, i);
      if (d > endDate) break;
      dates.push(fmtDate(d));
    }
  } else if (rule === "biweekly") {
    for (let i = 14; ; i += 14) {
      const d = addDaysToDate(startDate, i);
      if (d > endDate) break;
      dates.push(fmtDate(d));
    }
  } else if (rule === "monthly") {
    const start = new Date(startDate + "T12:00:00Z");
    const dayOfMonth = start.getUTCDate();
    for (let m = 1; m <= 12; m++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, dayOfMonth, 12));
      if (d > endDate) break;
      dates.push(fmtDate(d));
    }
  }
  return dates;
}
