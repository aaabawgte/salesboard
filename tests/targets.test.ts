import { describe, expect, it } from 'vitest';
import { calculateTargetProgress, estimateElapsedWorkingDays } from '../src/lib/targets';

describe('monthly warranty target', () => {
  it('calculates daily and catch-up targets in cents', () => {
    expect(calculateTargetProgress(100_000, 25_000, 20, 5)).toMatchObject({
      dailyTargetCents: 5_000,
      requiredDailyCents: 5_000,
      remainingCents: 75_000,
      remainingWorkingDays: 15,
      progress: 0.25
    });
  });

  it('estimates elapsed working days proportionally inside a month', () => {
    expect(estimateElapsedWorkingDays('2026-11', 20, new Date(2026, 10, 15))).toBe(10);
  });
});
