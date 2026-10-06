export type DailyReportWindow = {
  from: number;
  to: number;
  fromIso: string;
  toIso: string;
};

export function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailyReportWindow(dateKey: string): DailyReportWindow {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError('INVALID_REPORT_DATE');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (
    year < 2000 || year > 2200 ||
    start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day
  ) {
    throw new RangeError('INVALID_REPORT_DATE');
  }

  const end = new Date(year, month - 1, day + 1);
  return {
    from: start.getTime(),
    to: end.getTime(),
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}
