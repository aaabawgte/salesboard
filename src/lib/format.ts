export const hrDate = (date: string) => new Intl.DateTimeFormat('hr-HR', { dateStyle: 'medium', timeZone: 'Europe/Zagreb' }).format(new Date(`${date}T12:00:00`));
export const hrMoney = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(value);
export const hrNumber = (value: number) => new Intl.NumberFormat('hr-HR', { maximumFractionDigits: 2 }).format(value);
export const monthName = (month: string) => new Intl.DateTimeFormat('hr-HR', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
export const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2);
