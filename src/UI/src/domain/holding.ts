export type SecurityPayoutDetails = {
  exDividendDate: string;
  amount: number;
  declarationDate?: string | null;
  recordDate?: string | null;
  paymentDate?: string | null;
  source?: string | null;
  mode?: 'source' | 'manual';
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
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  detailsUpdatedAt?: string | null;
  detailsStatus?: string | null;
  payoutDetails?: SecurityPayoutDetails[];
  manualPayoutDetails?: SecurityPayoutDetails[];
};

export type HoldingAccountPosition = {
  accountId: string;
  quantity: number;
  costBasis?: number | null;
};

export type Holding = {
  id: string;
  security: SecurityMetadata;
  accountPositions: HoldingAccountPosition[];
  createdAt: string;
  updatedAt: string;
};

export type HoldingDraft = {
  security: SecurityMetadata;
  accountPositions: HoldingAccountPosition[];
};

export type SecurityDetailsRefreshResult = {
  holdings: Holding[];
  failedSymbols: string[];
};

export type HoldingImportRow = { symbol: string; name: string; price: number };

export type HoldingImportResult = {
  holdings: Holding[];
  unmatchedSymbols: string[];
};