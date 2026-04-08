import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats numbers in Italian locale: 1234.56 → 1.234,56
 * Null/undefined/zero → '0,00'
 * WCAG: does not change semantics, only presentation.
 */
@Pipe({ name: 'itNumber' })
export class ItalianNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined) return '0,00';
    return value.toLocaleString('it-IT', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
}

/**
 * Parses an Italian-formatted number string back to a float.
 * '1.234,56' → 1234.56
 */
export function parseItalianNumber(raw: string): number | null {
  if (!raw || raw.trim() === '') return null;
  // Remove thousands separators (dots) and replace decimal comma with dot
  const clean = raw.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}
