export type TargetProgress = {
  targetCents: number;
  achievedCents: number;
  remainingCents: number;
  dailyTargetCents: number;
  requiredDailyCents: number;
  workingDaysTotal: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  progress: number;
};

export function estimateElapsedWorkingDays(month: string, workingDaysTotal: number, now = new Date()) {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex || workingDaysTotal <= 0) return 0;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (month < currentMonth) return workingDaysTotal;
  if (month > currentMonth) return 0;
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  return Math.min(workingDaysTotal, Math.ceil(workingDaysTotal * now.getDate() / daysInMonth));
}

export function calculateTargetProgress(targetCents: number, achievedCents: number, workingDaysTotal: number, elapsedWorkingDays: number): TargetProgress {
  const target = Math.max(0, Math.round(targetCents));
  const achieved = Math.max(0, Math.round(achievedCents));
  const days = Math.max(1, Math.min(31, Math.round(workingDaysTotal)));
  const elapsed = Math.max(0, Math.min(days, Math.round(elapsedWorkingDays)));
  const remaining = Math.max(0, target - achieved);
  const remainingWorkingDays = Math.max(0, days - elapsed);
  return {
    targetCents: target,
    achievedCents: achieved,
    remainingCents: remaining,
    dailyTargetCents: Math.round(target / days),
    requiredDailyCents: remainingWorkingDays ? Math.round(remaining / remainingWorkingDays) : remaining,
    workingDaysTotal: days,
    elapsedWorkingDays: elapsed,
    remainingWorkingDays,
    progress: target ? achieved / target : 0
  };
}

