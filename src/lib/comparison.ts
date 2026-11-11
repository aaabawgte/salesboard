import type { Employee } from '../api';

export function bestDay(employee: Employee) {
  return employee.days.reduce<(typeof employee.days)[number] | null>((best, day) => !best || day.cents > best.cents ? day : best, null);
}

export function compareValues(a: number | null, b: number | null) {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return { leader: null, difference: null } as const;
  return { leader: a === b ? null : a > b ? 'first' : 'second', difference: Math.abs(a - b) } as const;
}

export function dailyComparison(first: Employee, second: Employee) {
  const firstDays = new Map(first.days.map(day => [day.date, day.value]));
  const secondDays = new Map(second.days.map(day => [day.date, day.value]));
  const dates = [...new Set([...firstDays.keys(), ...secondDays.keys()])].sort();
  return dates.map(date => ({ date, first: firstDays.get(date) ?? null, second: secondDays.get(date) ?? null }));
}
