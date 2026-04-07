export type ColumnDimension = 'Process' | 'Entity' | 'AdjLevel';

export interface FilterState {
  entityIds: number[];
  scopeId: number;
  currencyId: number;
  loadIds: number[];
  adjLevelIds?: number[];
  includeManualWriteback: boolean;
  costCenterCodes?: string[];
  coCodes?: string[];
  counterpartIds?: number[];
  /** Quale dimensione usare come colonne della griglia. Default: 'Process' */
  columnDimension?: ColumnDimension;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  entityIds: [],
  scopeId: 1,
  currencyId: 1,
  loadIds: [],
  includeManualWriteback: true,
};
