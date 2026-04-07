import { dbAll } from '../config/dbHelpers';
import { Currency } from '../models/dimension.models';

interface CurrencyRow { CurrencyId: number; CurrencyCode: string; Currency: string; }

export async function getAllCurrencies(): Promise<Currency[]> {
  const rows = await dbAll<CurrencyRow>(
    'SELECT CurrencyId, CurrencyCode, Currency FROM tCFS_Currency ORDER BY CurrencyCode'
  );
  return rows.map((r) => ({
    currencyId:          r.CurrencyId,
    currencyCode:        r.CurrencyCode,
    currencyDescription: r.Currency,
  }));
}
