export type CorporateAction = {
  id: string;
  effectiveDate: string;
  type: 'stock_split' | 'reverse_stock_split';
  oldShares: number;
  newShares: number;
};

export type SecurityPayoutDetails = {
  exDividendDate: string;
  amount: number;
  declarationDate?: string | null;
  recordDate?: string | null;
  paymentDate?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  status?: 'completed' | 'announced' | 'projected' | 'superseded';
  mode?: 'source' | 'manual';
  eventId?: string | null;
  securityId?: string | null;
  currency?: string | null;
  distributionType?: 'income' | 'capital_gain' | 'return_of_capital' | 'other';
  isRegular?: boolean;
  regularityBasis?: string | null;
  evidenceRef?: string | null;
  sourceAuthority?: string | null;
  amountPerShare?: string | null;
  rawAmount?: string | null;
  shareBasis?: string | null;
  appliedActionIds?: string[];
  forecastMethod?: string | null;
  forecastRange?: { min: string; max: string } | null;
  forecastInputEventIds?: string[];
  forecastAsOf?: string | null;
  supersedesEventId?: string | null;
  excludedFromTotals?: boolean;
};

export type SecurityMetadata = {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  currency: string;
  price?: number | null;
  sector?: string | null;
  industry?: string | null;
  peRatio?: number | null;
  thirtyDayYield?: number | null;
  fiftyTwoWeekLow?: number | null;
  fiftyTwoWeekHigh?: number | null;
  dividendPreviousYear?: number | null;
  dividendCurrentYear?: number | null;
  dividendGrowthRate?: number | null;
  estimatedFuturePayout?: number | null;
  dividendStatus?: string | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  detailsUpdatedAt?: string | null;
  detailsStatus?: string | null;
  payoutDetails?: SecurityPayoutDetails[];
  sourcePayoutDetails?: SecurityPayoutDetails[];
  manualPayoutDetails?: SecurityPayoutDetails[];
  dividendResearchRetrievedAt?: string | null;
  dividendResearchProvider?: string | null;
  dividendResearchSourceUrl?: string | null;
  dividendResearchAuthoritative?: boolean | null;
  dividendResearchSchemaVersion?: number | null;
  dividendResearchAdjustmentBasis?: 'raw' | 'current_share_basis' | null;
  dividendResearchWarnings?: string[];
  dividendResearchAsOf?: string | null;
  dividendResearchStatus?: 'fresh' | 'partial' | 'unavailable' | 'unsupported' | null;
  dividendResearchHistoryStart?: string | null;
  dividendResearchForecastEnd?: string | null;
  dividendResearchSnapshotId?: string | null;
  dividendResearchSnapshot?: Record<string, unknown>;
  payoutAuditDetails?: SecurityPayoutDetails[];
  corporateActions?: CorporateAction[];
};

export type HoldingAccountPosition = {
  accountId: string;
  quantity: number;
  costBasis?: number | null;
};

export type Holding = {
  id: string;
  /** Missing on legacy holdings; defaults to enabled. */
  manageDividends?: boolean;
  security: SecurityMetadata;
  accountPositions: HoldingAccountPosition[];
  createdAt: string;
  updatedAt: string;
};

export type HoldingDraft = {
  manageDividends?: boolean;
  security: SecurityMetadata;
  accountPositions: HoldingAccountPosition[];
};

export type SecurityDetailsRefreshResult = {
  holdings: Holding[];
  failedSymbols: string[];
};

export type HoldingImportRow = {
  symbol: string;
  name: string;
  price: number;
  accountPositions: HoldingAccountPosition[];
  /** Omitted for legacy CSVs, null when the current-template cell is explicitly blank. */
  dividendGrowthRate?: number | null;
};

export type HoldingImportResult = {
  holdings: Holding[];
  unmatchedSymbols: string[];
};

export type PassiveIncomeImportRow = {
  symbol: string;
  payout: SecurityPayoutDetails;
};
