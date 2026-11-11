const zagrebCalendar = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit'
});

export function getReportingMonth(date = new Date()): string {
  const parts = zagrebCalendar.formatToParts(date);
  const year = parts.find(part => part.type === 'year')!.value.padStart(4, '0');
  const month = parts.find(part => part.type === 'month')!.value;
  return `${year}-${month}`;
}

export function getMonthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { from, to: end.toISOString().slice(0, 10) };
}
