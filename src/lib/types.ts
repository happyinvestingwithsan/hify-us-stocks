export type MarketCapTier = "MEGA" | "LARGE" | "MID" | "SMALL";

export const MARKET_CAP_LIMITS: Record<MarketCapTier, number> = {
  MEGA: 5.0,
  LARGE: 4.0,
  MID: 3.0,
  SMALL: 1.5,
};

export type GttStatus = "NONE" | "PLANNED" | "PLACED" | "TRIGGERED";
export type DataSource = "INDMONEY" | "EXCEL" | "MANUAL";
export type QuoteSource = "YAHOO" | "INDMONEY" | "MANUAL";
export type ExecutionType = "GTT" | "INSTANT";
export type ExecutionMode = "GTT" | "Instant";

/** Supported order types for discipline & future order-assist (no stop-loss). */
export type OrderTypeOption = "90D_TRIGGER" | "LIMIT" | "MARKET";

export type OpportunityActionType = "PLACE_ORDER" | "REVIEW_CHART" | "WATCH";
export type OpportunityActionStatus = "PENDING" | "DONE" | "SNOOZED" | "DISMISSED";

export interface Strategy {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: number;
  ticker: string;
  companyName: string;
  leaderMention: string;
  strategy: string;
  marketCapTier: MarketCapTier | null;
  currentPriceUsd: number | null;
  plannedOrderType: OrderTypeOption;
  triggerPriceUsd: number | null;
  targetCapitalUsd: number | null;
  plannedShares: number | null;
  actionType: OpportunityActionType;
  actionDueDate: string | null; // YYYY-MM-DD
  actionStatus: OpportunityActionStatus;
  snoozedUntil: string | null; // YYYY-MM-DD
  thesisNotes: string;
  source: DataSource;
  createdAt: string;
  updatedAt: string;
}

export type BrokerOrderStatus =
  | "SUCCESS"
  | "PENDING"
  | "CANCELLED"
  | "EXPIRED"
  | "REJECTED"
  | "UNKNOWN";

export type BrokerOrderDecisionStatus =
  | "PENDING_REVIEW"
  | "REPLACED"
  | "ADJUSTED"
  | "DISMISSED";

export interface BrokerOrder {
  id: number;
  externalId: string;
  ticker: string;
  companyName: string;
  side: "BUY" | "SELL";
  orderType: string;
  status: BrokerOrderStatus;
  cancellationReason: string;
  shares: number;
  priceUsd: number;
  valueUsd: number;
  orderDate: string; // YYYY-MM-DD
  expiryDate: string | null; // YYYY-MM-DD
  decisionStatus: BrokerOrderDecisionStatus;
  strategy: string;
  snoozedUntil: string | null;
  notes: string;
  rawJson: string;
}

export type DailyActionKind =
  | "MISSING_TARGET"
  | "PLACE_SELL_GTT_30PCT"
  | "REFRESH_CMP"
  | "CANCELLED_TRIGGER"
  | "EXPIRING_TRIGGER"
  | "OPPORTUNITY_ACTION";

export interface DailyActionItem {
  actionKey: string;
  kind: DailyActionKind;
  priority: "HIGH" | "MEDIUM" | "LOW";
  ticker: string;
  companyName: string;
  strategy: string;
  title: string;
  subtitle: string;
  dueDate: string | null;
  snoozedUntil: string | null;
  openLotId?: number;
  brokerOrderId?: number;
  opportunityId?: number;
  recommendedOrderType?: OrderTypeOption;
  priceUsd?: number | null;
}

export interface AccountSettings {
  targetCapitalUsd: number;
  liveUsdInrRate: number;
  lastSyncedAt: string | null;
  syncSource: string | null;
  brokerCashUsd: number;
  brokerInvestedUsd: number;
  brokerCurrentValueUsd: number;
  brokerPnlUsd: number;
  brokerHoldingsCount: number;
}

export interface InrDeposit {
  id: number;
  externalId: string | null;
  depositDate: string; // YYYY-MM-DD
  inrAmount: number;
  fxRate: number;
  fxChargesInr: number;
  usdCredited: number;
  notes: string;
}

export interface OpenLot {
  id: number;
  externalId: string | null;
  ticker: string;
  companyName: string;
  buyDate: string; // YYYY-MM-DD
  shares: number;
  remainingShares: number;
  buyPriceUsd: number;
  buyValueUsd: number;
  feesUsd: number;
  strategy: string;
  targetPriceUsd: number | null;
  sellGttPriceUsd: number | null;
  sellGttStatus: GttStatus;
  marketCapTier: MarketCapTier | null;
  currentPriceUsd: number | null;
  executionMode: ExecutionMode;
  listName: string;
  prevCloseUsd: number | null;
  todayChangePct: number | null;
  athPriceUsd: number | null;
  quoteSource: QuoteSource | null;
  quoteUpdatedAt: string | null;
  lrd: string | null;
  notes: string;
  source: DataSource;
}

export interface ClosedTrade {
  id: number;
  externalId: string | null;
  openLotId: number | null;
  ticker: string;
  companyName: string;
  buyDate: string;
  sellDate: string;
  shares: number;
  buyPriceUsd: number;
  buyValueUsd: number;
  sellPriceUsd: number;
  sellValueUsd: number;
  buyFeesUsd: number;
  sellFeesUsd: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  pnlPct: number;
  daysHeld: number;
  strategy: string;
  targetPriceUsd: number | null;
  executionType: ExecutionType;
  executionMode: ExecutionMode;
  listName: string;
  cmpUsd: number | null;
  notes: string;
  source: DataSource;
}

export type CashflowEventType =
  | "DIVIDEND"
  | "WITHHOLDING_TAX"
  | "PLATFORM_FEE"
  | "FX_FEE"
  | "SEC_TAF_FEE";

export type WalletTxCategory =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "BUY_SETTLEMENT"
  | "SELL_SETTLEMENT"
  | "DIVIDEND"
  | "FEE"
  | "TAX"
  | "CANCELED"
  | "OTHER";

export interface WalletTransaction {
  id: number;
  externalId: string;
  txDate: string;
  createdAt: string;
  title: string;
  category: WalletTxCategory;
  amountUsd: number;
  status: string;
  notes: string;
  rawJson: string;
}

export interface CashflowEvent {
  id: number;
  externalId: string | null;
  eventDate: string;
  type: CashflowEventType;
  ticker: string | null;
  amountUsd: number;
  amountInr: number;
  notes: string;
}

export interface ConsolidatedTickerSummary {
  ticker: string;
  companyName: string;
  lotCount: number;
  totalShares: number;
  avgBuyPriceUsd: number;
  totalInvestedUsd: number;
  currentValueUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  allocationPctOfTarget: number;
  marketCapTier: MarketCapTier | null;
  maxAllowedPct: number | null;
}

export interface AccountProfitSummary {
  totalInrInvested: number;
  totalFxChargesInr: number;
  totalUsdDeposited: number;
  liveUsdInrRate: number;
  targetCapitalUsd: number;

  openCostBasisUsd: number;
  openCurrentValueUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlInr: number;

  realizedGrossPnlUsd: number;
  realizedNetPnlUsd: number;
  realizedNetPnlInr: number;

  totalDividendsUsd: number;
  totalTradeFeesUsd: number;
  totalStandaloneFeesUsd: number;
  totalAllFeesUsd: number;

  netAccountProfitUsd: number;
  netAccountProfitInr: number;
  currentAccountValueUsd: number;
  currentAccountValueInr: number;

  winRatePct: number;
  winningTrades: number;
  losingTrades: number;
  closedCount: number;
  openLotsCount: number;
  missingCmpLotsCount: number;

  brokerCashUsd: number;
  brokerInvestedUsd: number;
  brokerCurrentValueUsd: number;
  brokerPnlUsd: number;
  brokerHoldingsCount: number;
}

export interface OpenLotComputedMetrics {
  buyValueRemainingUsd: number;
  allocationPct: number;
  totalTickerAllocationPct: number;
  allocLeftPct: number | null;
  currentValueUsd: number | null;
  gainAmountUsd: number | null;
  currentGainPct: number | null;
  remainingGainPct: number | null;
  potentialGainPct: number | null;
  totalPotentialGainUsd: number | null;
  daysHeld: number;
  annualReturnPct: number | null;
  dAthPct: number | null;
  monthLabel: string;
  isSellGttReady30Pct: boolean;
}
