export interface Entity {
  entityId: number;
  entityCode: string;
  entityName: string;
  consolidationGroupId: number | null;
  countryCode: string | null;
}

export interface Process {
  loadId: number;
  processDescription: string;
  scenario: string;
  year: number;
  month: string;
  isLocked: boolean;
}

export interface Scope {
  scopeId: number;
  scopeCode: string;
  scopeDescription: string;
}

export interface AdjLevel {
  adjLevelId: number;
  adjLevelCode: string;
  adjLevelDescription: string;
  adjGroupId: number;
  adjGroupDescription: string;
}

export interface Currency {
  currencyId: number;
  currencyCode: string;
  currencyDescription: string;
}

export interface CostCenter {
  costCenterCode: string;
  costCenterDescription: string;
}

export interface CO {
  coCode: string;
  coDescription: string;
}

export interface Counterpart {
  entityId: number;
  entityCode: string;
  entityName: string;
}
