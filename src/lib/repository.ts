import {
  AccountSettings,
  BrokerOrder,
  BrokerOrderDecisionStatus,
  BrokerOrderStatus,
  CashflowEvent,
  ClosedTrade,
  ExecutionMode,
  InrDeposit,
  MarketCapTier,
  OpenLot,
  Opportunity,
  OpportunityActionStatus,
  OpportunityActionType,
  OrderTypeOption,
  QuoteSource,
  Strategy,
  WalletTransaction,
  WalletTxCategory,
} from "./types";

export interface CreateOpenLotInput {
  externalId?: string | null;
  ticker: string;
  companyName: string;
  buyDate: string;
  shares: number;
  buyPriceUsd: number;
  buyValueUsd: number;
  feesUsd?: number;
  strategy?: string;
  targetPriceUsd?: number | null;
  sellGttPriceUsd?: number | null;
  sellGttStatus?: OpenLot["sellGttStatus"];
  marketCapTier?: OpenLot["marketCapTier"];
  currentPriceUsd?: number | null;
  executionMode?: ExecutionMode;
  listName?: string;
  prevCloseUsd?: number | null;
  todayChangePct?: number | null;
  athPriceUsd?: number | null;
  quoteSource?: QuoteSource | null;
  quoteUpdatedAt?: string | null;
  lrd?: string | null;
  notes?: string;
  source: OpenLot["source"];
}

export interface UpdateOpenLotInput {
  companyName?: string;
  shares?: number;
  remainingShares?: number;
  buyPriceUsd?: number;
  buyValueUsd?: number;
  feesUsd?: number;
  strategy?: string;
  targetPriceUsd?: number | null;
  sellGttPriceUsd?: number | null;
  sellGttStatus?: OpenLot["sellGttStatus"];
  marketCapTier?: OpenLot["marketCapTier"];
  currentPriceUsd?: number | null;
  listName?: string;
  prevCloseUsd?: number | null;
  todayChangePct?: number | null;
  athPriceUsd?: number | null;
  quoteSource?: QuoteSource | null;
  quoteUpdatedAt?: string | null;
  lrd?: string | null;
  notes?: string;
}

export interface UpdateClosedTradeInput {
  strategy?: string;
  targetPriceUsd?: number | null;
  cmpUsd?: number | null;
  listName?: string;
  executionMode?: ExecutionMode;
  buyFeesUsd?: number;
  sellFeesUsd?: number;
  notes?: string;
}

export interface UpdateDepositInput {
  inrAmount?: number;
  fxRate?: number;
  fxChargesInr?: number;
  usdCredited?: number;
  notes?: string;
}

export interface CreateClosedTradeInput {
  externalId?: string | null;
  openLotId?: number | null;
  ticker: string;
  companyName: string;
  buyDate: string;
  sellDate: string;
  shares: number;
  buyPriceUsd: number;
  buyValueUsd: number;
  sellPriceUsd: number;
  sellValueUsd: number;
  buyFeesUsd?: number;
  sellFeesUsd?: number;
  strategy?: string;
  targetPriceUsd?: number | null;
  executionType?: ClosedTrade["executionType"];
  executionMode?: ExecutionMode;
  listName?: string;
  cmpUsd?: number | null;
  notes?: string;
  source: ClosedTrade["source"];
}

export interface CreateDepositInput {
  externalId?: string | null;
  depositDate: string;
  inrAmount: number;
  fxRate: number;
  fxChargesInr?: number;
  usdCredited: number;
  notes?: string;
}

export interface CreateCashflowInput {
  externalId?: string | null;
  eventDate: string;
  type: CashflowEvent["type"];
  ticker?: string | null;
  amountUsd: number;
  amountInr?: number;
  notes?: string;
}

export interface CreateWalletTransactionInput {
  externalId: string;
  txDate: string;
  createdAt: string;
  title: string;
  category: WalletTxCategory;
  amountUsd: number;
  status: string;
  notes?: string;
  rawJson?: string;
}

export interface CreateOpportunityInput {
  ticker: string;
  companyName: string;
  leaderMention?: string;
  strategy?: string;
  marketCapTier?: MarketCapTier | null;
  currentPriceUsd?: number | null;
  plannedOrderType?: OrderTypeOption;
  triggerPriceUsd?: number | null;
  targetCapitalUsd?: number | null;
  plannedShares?: number | null;
  actionType?: OpportunityActionType;
  actionDueDate?: string | null;
  actionStatus?: OpportunityActionStatus;
  snoozedUntil?: string | null;
  thesisNotes?: string;
  source?: Opportunity["source"];
}

export interface UpdateOpportunityInput {
  companyName?: string;
  leaderMention?: string;
  strategy?: string;
  marketCapTier?: MarketCapTier | null;
  currentPriceUsd?: number | null;
  plannedOrderType?: OrderTypeOption;
  triggerPriceUsd?: number | null;
  targetCapitalUsd?: number | null;
  plannedShares?: number | null;
  actionType?: OpportunityActionType;
  actionDueDate?: string | null;
  actionStatus?: OpportunityActionStatus;
  snoozedUntil?: string | null;
  thesisNotes?: string;
}

export interface CreateBrokerOrderInput {
  externalId: string;
  ticker: string;
  companyName?: string;
  side: "BUY" | "SELL";
  orderType: string;
  status: BrokerOrderStatus;
  cancellationReason?: string;
  shares: number;
  priceUsd: number;
  valueUsd: number;
  orderDate: string;
  expiryDate?: string | null;
  strategy?: string;
  notes?: string;
  rawJson?: string;
}

/**
 * Storage abstraction so personal mode uses local SQLite and
 * future community mode (happy-investing.in) can swap to Google Sheets / Drive.
 */
export interface JournalRepository {
  getSettings(): AccountSettings;
  updateSettings(patch: Partial<AccountSettings>): AccountSettings;

  listDeposits(): InrDeposit[];
  addDeposit(input: CreateDepositInput): InrDeposit;
  upsertDepositByExternalId(input: CreateDepositInput): { deposit: InrDeposit; created: boolean };
  updateDeposit(id: number, patch: UpdateDepositInput): InrDeposit | null;
  deleteDeposit(id: number): void;

  listOpenLots(): OpenLot[];
  listAllOpenLots(): OpenLot[];
  getOpenLot(id: number): OpenLot | null;
  upsertOpenLotByExternalId(input: CreateOpenLotInput): { lot: OpenLot; created: boolean };
  updateOpenLot(id: number, patch: UpdateOpenLotInput): OpenLot | null;
  updateQuotesForTicker(
    ticker: string,
    quote: {
      currentPriceUsd: number;
      prevCloseUsd: number | null;
      todayChangePct: number | null;
      athPriceUsd: number | null;
      quoteSource: QuoteSource;
      quoteUpdatedAt: string;
    }
  ): Promise<number>;
  deleteOpenLot(id: number): void;
  deleteIndmoneyTrades(): void;
  closeOpenLotShares(params: {
    openLotId: number;
    sharesToClose: number;
    sellDate: string;
    sellPriceUsd: number;
    sellFeesUsd?: number;
    executionType?: ClosedTrade["executionType"];
    executionMode?: ExecutionMode;
    listName?: string;
    cmpUsd?: number | null;
    strategy?: string;
    targetPriceUsd?: number | null;
    notes?: string;
    externalId?: string | null;
    source?: ClosedTrade["source"];
  }): ClosedTrade;

  listClosedTrades(): ClosedTrade[];
  getClosedTrade(id: number): ClosedTrade | null;
  updateClosedTrade(id: number, patch: UpdateClosedTradeInput): ClosedTrade | null;
  upsertClosedTradeByExternalId(input: CreateClosedTradeInput): { trade: ClosedTrade; created: boolean };

  listCashflows(): CashflowEvent[];
  upsertCashflowByExternalId(input: CreateCashflowInput): { event: CashflowEvent; created: boolean };
  deleteCashflow(id: number): void;

  listWalletTransactions(): WalletTransaction[];
  upsertWalletTransaction(input: CreateWalletTransactionInput): { tx: WalletTransaction; created: boolean };

  listStrategies(): Strategy[];
  createStrategy(input: { name: string; description?: string }): Strategy;
  updateStrategy(id: number, patch: { name?: string; description?: string; isActive?: boolean }): Strategy | null;
  deleteStrategy(id: number): void;

  listOpportunities(): Opportunity[];
  getOpportunity(id: number): Opportunity | null;
  upsertOpportunityByTicker(input: CreateOpportunityInput): { opportunity: Opportunity; created: boolean };
  updateOpportunity(id: number, patch: UpdateOpportunityInput): Opportunity | null;
  deleteOpportunity(id: number): void;

  listBrokerOrders(): BrokerOrder[];
  upsertBrokerOrder(input: CreateBrokerOrderInput): { order: BrokerOrder; created: boolean };
  updateBrokerOrderDecision(
    id: number,
    patch: { decisionStatus?: BrokerOrderDecisionStatus; strategy?: string; snoozedUntil?: string | null; notes?: string }
  ): BrokerOrder | null;

  getActionSnoozes(): Record<string, string>;
  setActionSnooze(actionKey: string, snoozedUntil: string | null): void;

  resetAll(): void;
}
