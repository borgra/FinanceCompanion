export type SecurityMetadata = {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  currency: string;
  price?: number | null;
  sector?: string | null;
  industry?: string | null;
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
