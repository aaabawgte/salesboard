import { describe, expect, it } from 'vitest';
import { getMonthRange, getReportingMonth } from '../src/lib/report-period';

describe('mjesečno izvještajno razdoblje', () => {
  it.each([
    ['2026-11', '2026-11-30'],
    ['2024-02', '2024-02-29'],
    ['2026-02', '2026-02-28'],
    ['2026-12', '2026-12-31']
  ])('obuhvaća cijeli mjesec %s', (month, to) => {
    expect(getMonthRange(month)).toEqual({ from: `${month}-01`, to });
  });

  it('odabire novi mjesec od ponoći u Zagrebu', () => {
    expect(getReportingMonth(new Date('2026-10-31T22:59:59Z'))).toBe('2026-10');
    expect(getReportingMonth(new Date('2026-10-31T23:00:00Z'))).toBe('2026-11');
    expect(getReportingMonth(new Date('2026-06-30T22:00:00Z'))).toBe('2026-07');
  });
});
