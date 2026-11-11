import { describe, expect, it } from 'vitest';
import { bestDay, compareValues, dailyComparison } from '../src/lib/comparison';
import type { Employee } from '../src/api';

const employee = (days: Employee['days']): Employee => ({ id: 1, name: 'A', rank: 1, cents: 0, value: 0, quantity: 0, avg: null, share: null, days });

describe('comparison calculations', () => {
  it('shows a leader and an exact net difference, including negative adjustments', () => {
    expect(compareValues(2175, 1610)).toEqual({ leader: 'first', difference: 565 });
    expect(compareValues(-495, 0)).toEqual({ leader: 'second', difference: 495 });
    expect(compareValues(0, 0)).toEqual({ leader: null, difference: 0 });
    expect(compareValues(null, 0)).toEqual({ leader: null, difference: null });
  });

  it('does not invent sales for dates without an employee record', () => {
    const first = employee([{ date: '2026-11-01', cents: 1000, value: 10, quantity: 1 }]);
    const second = employee([{ date: '2026-11-02', cents: 2000, value: 20, quantity: 1 }]);
    expect(dailyComparison(first, second)).toEqual([
      { date: '2026-11-01', first: 10, second: null },
      { date: '2026-11-02', first: null, second: 20 }
    ]);
    expect(bestDay(first)?.date).toBe('2026-11-01');
  });
});
