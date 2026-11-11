import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { aggregateRows, employeeKey, isCCOWBranch, parseDecimal, parseWorkbook, toIsoDate } from '../src/lib/importer';

function workbook(rows: Record<string, unknown>[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Izvještaj');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

describe('SalesBoard Excel importer', () => {
  it('parses Croatian dates, decimals, negative values and filters CCOW', () => {
    const result = parseWorkbook(workbook([
      { Datum: '09.02.2024', POSLOVNICA: 'CCOW', KOMERCIJALIST: 'Željko Primjer', KOLIČINA: '1', VREDNOST: '21,75' },
      { Datum: '09.02.2024', POSLOVNICA: 'CCOW', KOMERCIJALIST: 'Željko Primjer', KOLIČINA: '-1', VREDNOST: '-4,95' },
      { Datum: '09.02.2024', POSLOVNICA: 'Druga poslovnica', KOMERCIJALIST: 'Drugi Primjer', KOLIČINA: '3', VREDNOST: '123,00' }
    ]));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].cents).toBe(-495);
    expect(result.dateFrom).toBe('2024-02-09');
    expect(result.employees).toEqual(['Željko Primjer']);
  });

  it('aggregates repeated source rows without pretending they are invoices', () => {
    const result = aggregateRows(parseWorkbook(workbook([
      { Datum: '1.02.2024', POSLOVNICA: 'Big Bang CCOW', KOMERCIJALIST: 'Primjer Ana', KOLIČINA: 1, VREDNOST: '10,00' },
      { Datum: '01/02/2024', POSLOVNICA: 'Big Bang CCOW', KOMERCIJALIST: 'Ana Primjer', KOLIČINA: 2, VREDNOST: '20.00' }
    ])).rows);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
    expect(result[0].cents).toBe(3000);
    expect(employeeKey('Ana Primjer')).toBe(employeeKey('Primjer Ana'));
  });

  it('handles branch aliases and numeric date formats', () => {
    expect(isCCOWBranch('City Center One West')).toBe(true);
    expect(isCCOWBranch('CCOW')).toBe(true);
    expect(isCCOWBranch('Big Bang Zagreb CCO West')).toBe(true);
    expect(isCCOWBranch('Arena Zagreb')).toBe(false);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('-4,95')).toBe(-4.95);
    expect(toIsoDate('2024-02-09')).toBe('2024-02-09');
  });
});
