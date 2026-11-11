import type { Analytics } from './api';

const samples = [
  { name: 'Demo djelatnik A', sales: [[5, 18150], [2, 7950], [4, 15000]] },
  { name: 'Demo djelatnik B', sales: [[2, 6700], [4, 14250], [3, 10200]] },
  { name: 'Demo djelatnik C', sales: [[1, 3250], [3, 11500], [2, 8400]] }
];

export function createDemoAnalytics(from: string, to: string): Analytics {
  const month = from.slice(0, 7);
  const dates = [from, `${month}-03`, `${month}-05`];
  const employees = samples.map(({ name, sales }, index) => {
    const days = sales.map(([quantity, cents], day) => ({
      date: dates[day], quantity, cents, value: cents / 100
    }));
    const quantity = days.reduce((sum, day) => sum + day.quantity, 0);
    const cents = days.reduce((sum, day) => sum + day.cents, 0);
    return { id: index + 1, name, quantity, cents, value: cents / 100, days };
  });

  const totalCents = employees.reduce((sum, employee) => sum + employee.cents, 0);
  const quantity = employees.reduce((sum, employee) => sum + employee.quantity, 0);
  const leaderboard = employees.sort((a, b) => b.cents - a.cents).map((employee, index) => ({
    ...employee,
    rank: index + 1,
    avg: Math.round(employee.cents / employee.quantity) / 100,
    share: employee.cents / totalCents
  }));
  const rows = leaderboard.flatMap(employee => employee.days.map(day => ({
    ...day, employee: employee.name, employee_id: employee.id
  })));
  const daily = dates.map(date => {
    const entries = rows.filter(row => row.date === date);
    const quantity = entries.reduce((sum, row) => sum + row.quantity, 0);
    const cents = entries.reduce((sum, row) => sum + row.cents, 0);
    return { date, quantity, cents, value: cents / 100 };
  });

  return {
    from, to, totalCents, total: totalCents / 100, quantity,
    employees: leaderboard, leaderboard, daily, rows,
    latestImport: { imported_at: `${month}-06T08:15:00Z`, file_name: 'demo-izvjestaj.xlsx' }
  };
}
