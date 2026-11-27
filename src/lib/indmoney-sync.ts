import { CreateBrokerOrderInput, CreateWalletTransactionInput, JournalRepository } from "./repository";
import { BrokerOrderStatus, CashflowEventType, ExecutionMode, ExecutionType, WalletTxCategory } from "./types";

export interface IndmoneyExecutionPayload {
  externalId: string;
  side: "BUY" | "SELL";
  ticker: string;
  companyName?: string;
  tradeDate: string; // YYYY-MM-DD
  shares: number;
  priceUsd: number;
  valueUsd?: number;
  feesUsd?: number;
  executionType?: ExecutionType;
  executionMode?: ExecutionMode;
  openLotId?: number;
  notes?: string;
}

export interface IndmoneyDepositPayload {
  externalId?: string;
  depositDate: string;
  inrAmount: number;
  fxRate: number;
  fxChargesInr?: number;
  usdCredited: number;
  notes?: string;
}

export interface IndmoneyCashflowPayload {
  externalId: string;
  eventDate: string;
  type: CashflowEventType;
  ticker?: string | null;
  amountUsd: number;
  amountInr?: number;
  notes?: string;
}

export interface BrokerHoldingSnapshot {
  ticker: string;
  companyName: string;
  quantity: number;
  avgPriceUsd: number;
  investedAmountUsd: number;
  currentValueUsd: number;
  livePriceUsd: number;
}

export interface BrokerAccountSnapshot {
  brokerCashUsd?: number;
  brokerInvestedUsd?: number;
  brokerCurrentValueUsd?: number;
  brokerPnlUsd?: number;
  brokerHoldingsCount?: number;
}

export interface IndmoneySyncPayload {
  executions?: IndmoneyExecutionPayload[];
  brokerOrders?: CreateBrokerOrderInput[];
  deposits?: IndmoneyDepositPayload[];
  cashflows?: IndmoneyCashflowPayload[];
  walletTransactions?: CreateWalletTransactionInput[];
  liveUsdInrRate?: number;
  currentPrices?: Record<string, number>;
  brokerHoldings?: BrokerHoldingSnapshot[];
  brokerSummary?: BrokerAccountSnapshot;
  reconcileOrders?: boolean;
  source?: string;
  rawCaptures?: {
    orders?: Array<{ apiUrl?: string; payload?: unknown }>;
    holdings?: Array<{ apiUrl?: string; payload?: unknown }>;
    wallet?: Array<{ apiUrl?: string; payload?: unknown }>;
    other?: Array<{ apiUrl?: string; payload?: unknown }>;
  };
}

function parseUsdString(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = String(val ?? "").replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function classifyWalletCashflow(lowerTitle: string): CashflowEventType | null {
  if (lowerTitle.includes("dividend")) return "DIVIDEND";
  if (lowerTitle.includes("withholding") || lowerTitle.includes("tax")) return "WITHHOLDING_TAX";
  if (lowerTitle.includes("platform fee") || lowerTitle.includes("amc") || lowerTitle.includes("subscription")) {
    return "PLATFORM_FEE";
  }
  if (lowerTitle.includes("fx") || lowerTitle.includes("remittance") || lowerTitle.includes("gst")) {
    return "FX_FEE";
  }
  if (lowerTitle.includes("sec") || lowerTitle.includes("taf") || lowerTitle.includes("finra")) {
    return "SEC_TAF_FEE";
  }
  return null;
}

function classifyWalletTxCategory(
  title: string,
  status: string,
  amountUsd: number
): WalletTxCategory {
  if (status.toLowerCase() !== "success" || Math.abs(amountUsd) <= 0) {
    return "CANCELED";
  }
  const lower = title.toLowerCase();
  if (lower.includes("deposit credited") || lower.includes("funds added")) return "DEPOSIT";
  if (lower.includes("withdrawal") || lower.includes("withdraw")) return "WITHDRAWAL";
  if (lower.includes("buy settlement")) return "BUY_SETTLEMENT";
  if (lower.includes("sell settlement")) return "SELL_SETTLEMENT";
  if (lower.includes("dividend")) return "DIVIDEND";
  if (lower.includes("tax") || lower.includes("withholding")) return "TAX";
  if (
    lower.includes("fee") ||
    lower.includes("charge") ||
    lower.includes("commission") ||
    lower.includes("brok") ||
    lower.includes("sec") ||
    lower.includes("taf")
  ) {
    return "FEE";
  }
  return "OTHER";
}

function normalizeBrokerOrderStatus(rawStatus: string): BrokerOrderStatus {
  const s = rawStatus.trim().toLowerCase();
  if (s === "success" || s === "executed" || s === "filled" || s === "completed") return "SUCCESS";
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("expir")) return "EXPIRED";
  if (s.includes("reject") || s.includes("fail")) return "REJECTED";
  if (s.includes("pend") || s.includes("open") || s.includes("active") || s.includes("placed")) return "PENDING";
  return "UNKNOWN";
}

function addDaysIso(dateStr: string, days: number): string | null {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return d.toISOString().slice(0, 10);
}

/**
 * Normalizes raw INDmoney web API responses captured by the Chrome Extension
 * into structured executions, broker orders, deposits, cashflows, wallet transactions, live prices, and broker holdings.
 */
export function parseIndmoneyRawCaptures(
  rawCaptures: NonNullable<IndmoneySyncPayload["rawCaptures"]>
): Pick<
  IndmoneySyncPayload,
  | "executions"
  | "brokerOrders"
  | "deposits"
  | "cashflows"
  | "walletTransactions"
  | "currentPrices"
  | "brokerHoldings"
  | "brokerSummary"
> {
  const executions: IndmoneyExecutionPayload[] = [];
  const brokerOrders: CreateBrokerOrderInput[] = [];
  const deposits: IndmoneyDepositPayload[] = [];
  const cashflows: IndmoneyCashflowPayload[] = [];
  const walletTransactions: CreateWalletTransactionInput[] = [];
  const currentPrices: Record<string, number> = {};
  const brokerHoldings: BrokerHoldingSnapshot[] = [];
  let brokerSummary: BrokerAccountSnapshot | undefined;

  const seenOrderIds = new Set<string>();
  const seenBrokerOrderIds = new Set<string>();
  const seenDepositIds = new Set<string>();
  const seenCashflowIds = new Set<string>();
  const seenWalletTxIds = new Set<string>();

  // 1. Parse orders/summary (supports multi-page captures, deduplicated by externalId)
  for (const entry of rawCaptures.orders ?? []) {
    if (!entry.apiUrl?.includes("orders/summary")) continue;
    const p = entry.payload as { data?: { orders?: Array<Record<string, unknown>> } } | undefined;
    const orders = p?.data?.orders ?? [];
    for (const o of orders) {
      const sideRaw = String(o.transaction_type ?? "").toUpperCase();
      if (sideRaw !== "BUY" && sideRaw !== "SELL") continue;

      const ticker = String(o.ind_key ?? o.product_type ?? "").trim().toUpperCase();
      if (!ticker) continue;

      const epoch = Number(o.date_epoch ?? 0);
      const tradeDate =
        epoch > 0
          ? new Date(epoch * 1000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

      const shares = Number(o.qty ?? 0);
      const priceUsd = Number(o.avg_price ?? o.trigger_price ?? o.limit_price ?? 0);
      const orderValue = Math.abs(parseUsdString(o.order_value));
      const orderType = String(o.order_type ?? "");
      const isTrigger = orderType.toLowerCase().includes("trigger") || orderType.toLowerCase().includes("gtt");
      const rawStatus = String(o.status ?? "");
      const normStatus = normalizeBrokerOrderStatus(rawStatus);
      const externalId = `ind:order:${String(o.order_id ?? `${ticker}:${tradeDate}:${shares}:${priceUsd}:${normStatus}`)}`;

      if (!seenBrokerOrderIds.has(externalId)) {
        seenBrokerOrderIds.add(externalId);
        const cancellationReason = String(
          o.cancellation_reason ?? o.cancel_reason ?? o.reason ?? o.remarks ?? o.status_message ?? ""
        ).trim();
        const rawExpiry = o.expiry_date ? String(o.expiry_date).slice(0, 10) : null;
        brokerOrders.push({
          externalId,
          ticker,
          companyName: String(o.name ?? ticker),
          side: sideRaw,
          orderType: orderType || "Unknown",
          status: normStatus,
          cancellationReason,
          shares: Number.isFinite(shares) ? shares : 0,
          priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
          valueUsd: orderValue > 0 ? orderValue : (Number.isFinite(shares * priceUsd) ? shares * priceUsd : 0),
          orderDate: tradeDate,
          expiryDate: rawExpiry || (isTrigger ? addDaysIso(tradeDate, 90) : null),
          rawJson: JSON.stringify(o),
        });
      }

      if (normStatus !== "SUCCESS") continue;
      if (shares <= 0 || priceUsd <= 0) continue;

      if (seenOrderIds.has(externalId)) continue;
      seenOrderIds.add(externalId);

      const feesUsd = Math.abs(
        parseUsdString(o.total_charges ?? o.charges ?? o.brokerage ?? o.fees ?? 0)
      );
      const executionType: ExecutionType = isTrigger ? "GTT" : "INSTANT";
      const executionMode: ExecutionMode = isTrigger ? "GTT" : "Instant";

      executions.push({
        externalId,
        side: sideRaw,
        ticker,
        companyName: String(o.name ?? ticker),
        tradeDate,
        shares,
        priceUsd,
        valueUsd: orderValue > 0 ? orderValue : shares * priceUsd,
        feesUsd,
        executionType,
        executionMode,
        notes: orderType ? `INDmoney ${orderType}` : "",
      });
    }
  }

  // 2. Parse equity/summary for live prices, holdings reconciliation, & buying power
  for (const entry of rawCaptures.holdings ?? []) {
    if (!entry.apiUrl?.includes("equity/summary")) continue;
    const p = entry.payload as Record<string, unknown> | undefined;
    if (!p) continue;

    const walletBal = p.user_wallet_balance as Record<string, unknown> | undefined;
    const demat = p.demat_summary as Record<string, unknown> | undefined;
    const assetSummary = demat?.asset_summary as Record<string, unknown> | undefined;
    const holdingsSummary = assetSummary?.holdings_summary as Record<string, unknown> | undefined;

    brokerSummary = {
      brokerCashUsd: walletBal ? Number(walletBal.available_balance ?? 0) : undefined,
      brokerInvestedUsd: holdingsSummary ? Number(holdingsSummary.invested_value ?? 0) : undefined,
      brokerCurrentValueUsd: holdingsSummary ? Number(holdingsSummary.current_value ?? 0) : undefined,
      brokerPnlUsd: holdingsSummary ? Number(holdingsSummary.pnl ?? 0) : undefined,
      brokerHoldingsCount: holdingsSummary ? Number(holdingsSummary.holding_count ?? 0) : undefined,
    };

    const scrips =
      (assetSummary?.scrip_details as Array<Record<string, unknown>> | undefined) ??
      (demat?.scrip_details as Array<Record<string, unknown>> | undefined) ??
      [];

    for (const s of scrips) {
      const meta = (s.metadata as Record<string, unknown> | undefined) ?? s;
      const hold = (s.holdings as Record<string, unknown> | undefined) ?? s;

      const ticker = String(meta.ind_key ?? meta.symbol ?? s.ind_key ?? s.symbol ?? "")
        .trim()
        .toUpperCase();
      if (!ticker) continue;

      const companyName = String(meta.name ?? s.name ?? ticker).trim();
      const quantity = Number(hold.quantity ?? s.quantity ?? 0);
      const avgPriceUsd = Number(hold.avg_price ?? s.avg_price ?? 0);
      const investedAmountUsd = Number(hold.invested_amount ?? s.invested_amount ?? 0);
      const currentValueUsd = Number(hold.current_value ?? s.current_value ?? 0);
      let livePriceUsd = Number(meta.live_price ?? s.live_price ?? s.ltp ?? s.current_price ?? 0);
      if (livePriceUsd <= 0 && quantity > 0 && currentValueUsd > 0) {
        livePriceUsd = currentValueUsd / quantity;
      }

      if (livePriceUsd > 0) {
        currentPrices[ticker] = livePriceUsd;
      }
      if (quantity > 0) {
        brokerHoldings.push({
          ticker,
          companyName,
          quantity,
          avgPriceUsd,
          investedAmountUsd,
          currentValueUsd,
          livePriceUsd,
        });
      }
    }
  }

  // 3. Parse wallet transactionsForWeb for deposits, dividends, & fee/tax events
  for (const entry of rawCaptures.wallet ?? []) {
    if (!entry.apiUrl?.includes("transactionsForWeb")) continue;
    const p = entry.payload as
      | { monthly_trxn?: Array<{ trxn_list?: Array<Record<string, unknown>> }> }
      | undefined;

    for (const monthBlock of p?.monthly_trxn ?? []) {
      for (const tx of monthBlock.trxn_list ?? []) {
        const statusStr = String(tx.status ?? "").trim() || "UNKNOWN";
        const title = String(tx.card_title ?? "").trim();
        const lowerTitle = title.toLowerCase();
        const signedAmountUsd = parseUsdString(tx.amount);
        const amountUsd = Math.abs(signedAmountUsd);
        const createdAtRaw = String(tx.created_date ?? "").trim();
        const createdDate =
          createdAtRaw.slice(0, 10) || new Date().toISOString().slice(0, 10);

        const wtxExtId =
          tx.id !== undefined && tx.id !== null
            ? `ind:wtx:${String(tx.id)}`
            : `ind:wtx:${createdAtRaw || createdDate}:${title}:${signedAmountUsd}:${statusStr}`;
        if (!seenWalletTxIds.has(wtxExtId)) {
          seenWalletTxIds.add(wtxExtId);
          walletTransactions.push({
            externalId: wtxExtId,
            txDate: createdDate,
            createdAt: createdAtRaw || createdDate,
            title,
            category: classifyWalletTxCategory(title, statusStr, signedAmountUsd),
            amountUsd: signedAmountUsd,
            status: statusStr,
            notes: String(tx.created ?? ""),
            rawJson: JSON.stringify(tx),
          });
        }

        if (statusStr.toLowerCase() !== "success") continue;
        if (amountUsd <= 0) continue;

        // Deposits
        if (lowerTitle.includes("deposit credited") || lowerTitle.includes("funds added")) {
          const extId = `ind:dep:${String(tx.id ?? `${createdDate}:${amountUsd}`)}`;
          if (seenDepositIds.has(extId)) continue;
          seenDepositIds.add(extId);

          deposits.push({
            externalId: extId,
            depositDate: createdDate,
            inrAmount: 0,
            fxRate: 0,
            fxChargesInr: 0,
            usdCredited: amountUsd,
            notes: tx.id ? `${title} (#${String(tx.id)})` : title,
          });
          continue;
        }

        // Ignore stock buy/sell settlements (covered by orders/summary)
        if (lowerTitle.includes("buy settlement") || lowerTitle.includes("sell settlement")) {
          continue;
        }

        const cfType = classifyWalletCashflow(lowerTitle);
        if (!cfType) continue;

        const firstWord = title.split(/\s+/)[0]?.toUpperCase() ?? "";
        const ticker =
          cfType === "DIVIDEND" && /^[A-Z0-9.-]{1,6}$/.test(firstWord) ? firstWord : null;
        const prefix = cfType === "DIVIDEND" ? "div" : cfType.toLowerCase();
        const extId = `ind:${prefix}:${String(
          tx.id ?? `${createdDate}:${ticker ?? "US"}:${amountUsd}`
        )}`;
        if (seenCashflowIds.has(extId)) continue;
        seenCashflowIds.add(extId);

        cashflows.push({
          externalId: extId,
          eventDate: createdDate,
          type: cfType,
          ticker,
          amountUsd,
          notes: title,
        });
      }
    }
  }

  return {
    executions,
    brokerOrders,
    deposits,
    cashflows,
    walletTransactions,
    currentPrices,
    brokerHoldings,
    brokerSummary,
  };
}

export interface IndmoneySyncResult {
  buysCreated: number;
  buysSkipped: number;
  sellsMatched: number;
  sellsUnmatched: number;
  depositsCreated: number;
  cashflowsCreated: number;
  walletTransactionsUpserted: number;
  pricesUpdated: number;
  splitsAdjusted: number;
  reconLotsUpserted: number;
}

/**
 * Idempotent ingest for INDmoney US Stocks tradebook executions,
 * deposits, dividends/fees, wallet ledger, live quotes, and holdings reconciliation.
 */
export function processIndmoneySync(
  payload: IndmoneySyncPayload,
  repo: JournalRepository
): IndmoneySyncResult {
  let executionsInput = payload.executions ?? [];
  let brokerOrdersInput = payload.brokerOrders ?? [];
  let depositsInput = payload.deposits ?? [];
  let cashflowsInput = payload.cashflows ?? [];
  let walletTransactionsInput = payload.walletTransactions ?? [];
  let currentPricesInput = payload.currentPrices ?? {};
  let brokerHoldingsInput = payload.brokerHoldings ?? [];
  let brokerSummaryInput = payload.brokerSummary;

  if (payload.rawCaptures) {
    const parsed = parseIndmoneyRawCaptures(payload.rawCaptures);
    if (executionsInput.length === 0 && parsed.executions) executionsInput = parsed.executions;
    if (brokerOrdersInput.length === 0 && parsed.brokerOrders) brokerOrdersInput = parsed.brokerOrders;
    if (depositsInput.length === 0 && parsed.deposits) depositsInput = parsed.deposits;
    if (cashflowsInput.length === 0 && parsed.cashflows) cashflowsInput = parsed.cashflows;
    if (walletTransactionsInput.length === 0 && parsed.walletTransactions) {
      walletTransactionsInput = parsed.walletTransactions;
    }
    if (brokerHoldingsInput.length === 0 && parsed.brokerHoldings) {
      brokerHoldingsInput = parsed.brokerHoldings;
    }
    if (!brokerSummaryInput && parsed.brokerSummary) brokerSummaryInput = parsed.brokerSummary;
    currentPricesInput = { ...(parsed.currentPrices ?? {}), ...currentPricesInput };
  }

  let buysCreated = 0;
  let buysSkipped = 0;
  let sellsMatched = 0;
  let sellsUnmatched = 0;
  let depositsCreated = 0;
  let cashflowsCreated = 0;
  let walletTransactionsUpserted = 0;
  let pricesUpdated = 0;
  let splitsAdjusted = 0;
  let reconLotsUpserted = 0;

  if (payload.liveUsdInrRate && payload.liveUsdInrRate > 0) {
    repo.updateSettings({ liveUsdInrRate: payload.liveUsdInrRate });
  }
  for (const bo of brokerOrdersInput) {
    repo.upsertBrokerOrder(bo);
  }
  if (brokerSummaryInput) {
    repo.updateSettings({
      brokerCashUsd: brokerSummaryInput.brokerCashUsd,
      brokerInvestedUsd: brokerSummaryInput.brokerInvestedUsd,
      brokerCurrentValueUsd: brokerSummaryInput.brokerCurrentValueUsd,
      brokerPnlUsd: brokerSummaryInput.brokerPnlUsd,
      brokerHoldingsCount: brokerSummaryInput.brokerHoldingsCount,
    });
  }

  // 0. Process Deposits (skip if an LRS-enriched deposit already exists for same date + USD)
  const existingDeposits = repo.listDeposits();
  for (const dep of depositsInput) {
    const alreadyEnriched = existingDeposits.some(
      (d) =>
        d.depositDate === dep.depositDate &&
        Math.abs(d.usdCredited - dep.usdCredited) <= 0.05 &&
        d.inrAmount > 0
    );
    if (alreadyEnriched) continue;
    const { created } = repo.upsertDepositByExternalId(dep);
    if (created) depositsCreated++;
  }

  const shouldRebuildOrders =
    ((payload.rawCaptures?.orders?.length ?? 0) > 0 || Boolean(payload.reconcileOrders)) &&
    executionsInput.length > 0;

  // Snapshot user/report-entered metadata (strategy, targetPriceUsd, fees, GTT, tier, notes) before rebuilding
  const savedLotMeta = new Map<
    string,
    {
      strategy: string;
      targetPriceUsd: number | null;
      sellGttPriceUsd: number | null;
      sellGttStatus: "NONE" | "PLANNED" | "PLACED" | "TRIGGERED";
      marketCapTier: "MEGA" | "LARGE" | "MID" | "SMALL" | null;
      feesUsd: number;
      notes: string;
    }
  >();
  const savedClosedMeta = new Map<
    string,
    {
      strategy: string;
      targetPriceUsd: number | null;
      cmpUsd: number | null;
      listName: string;
      buyFeesUsd: number;
      sellFeesUsd: number;
      notes: string;
    }
  >();

  if (shouldRebuildOrders) {
    for (const lot of repo.listAllOpenLots()) {
      if (lot.source === "INDMONEY" && lot.externalId) {
        savedLotMeta.set(lot.externalId, {
          strategy: lot.strategy,
          targetPriceUsd: lot.targetPriceUsd,
          sellGttPriceUsd: lot.sellGttPriceUsd,
          sellGttStatus: lot.sellGttStatus,
          marketCapTier: lot.marketCapTier,
          feesUsd: lot.feesUsd,
          notes: lot.notes,
        });
      }
    }
    for (const ct of repo.listClosedTrades()) {
      if (ct.source === "INDMONEY" && ct.externalId) {
        savedClosedMeta.set(ct.externalId, {
          strategy: ct.strategy,
          targetPriceUsd: ct.targetPriceUsd,
          cmpUsd: ct.cmpUsd,
          listName: ct.listName,
          buyFeesUsd: ct.buyFeesUsd,
          sellFeesUsd: ct.sellFeesUsd,
          notes: ct.notes,
        });
      }
    }
    repo.deleteIndmoneyTrades();
  }

  const executions = [...executionsInput].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      (a.side === b.side ? 0 : a.side === "BUY" ? -1 : 1) ||
      a.externalId.localeCompare(b.externalId)
  );

  // 1 & 2. Process executions in chronological order (BUY before SELL on same date)
  for (const exec of executions) {
    const ticker = exec.ticker.toUpperCase();

    if (exec.side === "BUY" && exec.shares > 0) {
      const saved = savedLotMeta.get(exec.externalId);
      const { created } = repo.upsertOpenLotByExternalId({
        externalId: exec.externalId,
        ticker,
        companyName: exec.companyName ?? ticker,
        buyDate: exec.tradeDate,
        shares: exec.shares,
        buyPriceUsd: exec.priceUsd,
        buyValueUsd: exec.valueUsd ?? exec.shares * exec.priceUsd,
        feesUsd: saved?.feesUsd ? saved.feesUsd : (exec.feesUsd ?? 0),
        strategy: saved?.strategy ?? "",
        targetPriceUsd: saved?.targetPriceUsd ?? null,
        sellGttPriceUsd: saved?.sellGttPriceUsd ?? null,
        sellGttStatus: saved?.sellGttStatus ?? "NONE",
        marketCapTier: saved?.marketCapTier ?? null,
        executionMode: exec.executionMode ?? (exec.executionType === "GTT" ? "GTT" : "Instant"),
        notes: saved?.notes || exec.notes || "",
        source: "INDMONEY",
      });
      if (created) buysCreated++;
      else buysSkipped++;
      continue;
    }

    if (exec.side !== "SELL" || exec.shares <= 0) continue;

    const alreadyClosed = repo
      .listClosedTrades()
      .some((t) => t.externalId && t.externalId.startsWith(exec.externalId));
    if (alreadyClosed) continue;

    if (exec.openLotId) {
      const saved = savedClosedMeta.get(exec.externalId);
      repo.closeOpenLotShares({
        openLotId: exec.openLotId,
        sharesToClose: exec.shares,
        sellDate: exec.tradeDate,
        sellPriceUsd: exec.priceUsd,
        sellFeesUsd: exec.feesUsd ?? 0,
        executionType: exec.executionType ?? "INSTANT",
        executionMode: exec.executionMode ?? (exec.executionType === "GTT" ? "GTT" : "Instant"),
        listName: saved?.listName ?? "Others",
        cmpUsd: saved?.cmpUsd ?? currentPricesInput[ticker] ?? null,
        strategy: saved?.strategy ?? "",
        targetPriceUsd: saved?.targetPriceUsd ?? exec.priceUsd,
        notes: saved?.notes || exec.notes || "",
        externalId: exec.externalId,
        source: "INDMONEY",
      });
      sellsMatched++;
      continue;
    }

    const openLots = repo
      .listOpenLots()
      .filter(
        (l) =>
          l.ticker.toUpperCase() === ticker &&
          l.remainingShares > 0.000001 &&
          !l.externalId?.endsWith(":recon")
      )
      .sort((a, b) => a.buyDate.localeCompare(b.buyDate) || a.id - b.id);

    // Priority 1: 1-to-1 Exact Qty Match (within 1e-5)
    const exactLot = openLots.find((l) => Math.abs(l.remainingShares - exec.shares) <= 1e-5);
    if (exactLot) {
      const saved = savedClosedMeta.get(exec.externalId);
      const closed = repo.closeOpenLotShares({
        openLotId: exactLot.id,
        sharesToClose: exactLot.remainingShares,
        sellDate: exec.tradeDate,
        sellPriceUsd: exec.priceUsd,
        sellFeesUsd: saved?.sellFeesUsd ? saved.sellFeesUsd : (exec.feesUsd ?? 0),
        executionType: exec.executionType ?? "INSTANT",
        executionMode: exec.executionMode ?? (exec.executionType === "GTT" ? "GTT" : "Instant"),
        listName: saved?.listName ?? "Others",
        cmpUsd: saved?.cmpUsd ?? currentPricesInput[ticker] ?? null,
        strategy: saved?.strategy ?? (exactLot.strategy || ""),
        targetPriceUsd: saved?.targetPriceUsd ?? exec.priceUsd,
        notes: saved?.notes || exec.notes || "",
        externalId: exec.externalId,
        source: "INDMONEY",
      });
      if (saved?.buyFeesUsd && saved.buyFeesUsd > 0 && closed.buyFeesUsd === 0) {
        repo.updateClosedTrade(closed.id, { buyFeesUsd: saved.buyFeesUsd });
      }
      sellsMatched++;
      continue;
    }

    // Priority 2: Full-Position Close (sell.shares == sum of all open lots within 1e-5)
    const totalOpenShares = openLots.reduce((s, l) => s + l.remainingShares, 0);
    if (openLots.length > 0 && Math.abs(totalOpenShares - exec.shares) <= 1e-5) {
      let sliceIdx = 0;
      for (const lot of openLots) {
        const extId = sliceIdx === 0 ? exec.externalId : `${exec.externalId}#${sliceIdx}`;
        const saved = savedClosedMeta.get(extId);
        const feeShare =
          totalOpenShares > 0 ? ((exec.feesUsd ?? 0) * lot.remainingShares) / totalOpenShares : 0;
        const closed = repo.closeOpenLotShares({
          openLotId: lot.id,
          sharesToClose: lot.remainingShares,
          sellDate: exec.tradeDate,
          sellPriceUsd: exec.priceUsd,
          sellFeesUsd: saved?.sellFeesUsd ? saved.sellFeesUsd : feeShare,
          executionType: exec.executionType ?? "INSTANT",
          executionMode: exec.executionMode ?? (exec.executionType === "GTT" ? "GTT" : "Instant"),
          listName: saved?.listName ?? "Others",
          cmpUsd: saved?.cmpUsd ?? currentPricesInput[ticker] ?? null,
          strategy: saved?.strategy ?? (lot.strategy || ""),
          targetPriceUsd: saved?.targetPriceUsd ?? exec.priceUsd,
          notes: saved?.notes || exec.notes || "",
          externalId: extId,
          source: "INDMONEY",
        });
        if (saved?.buyFeesUsd && saved.buyFeesUsd > 0 && closed.buyFeesUsd === 0) {
          repo.updateClosedTrade(closed.id, { buyFeesUsd: saved.buyFeesUsd });
        }
        sliceIdx++;
      }
      sellsMatched++;
      continue;
    }

    // Priority 3: Fallback chronological match (partial dollar sells like META)
    let remainingToSell = exec.shares;
    let sliceIdx = 0;
    for (const lot of openLots) {
      if (remainingToSell <= 0.000001) break;
      const take = Math.min(remainingToSell, lot.remainingShares);
      const feeShare = exec.shares > 0 ? ((exec.feesUsd ?? 0) * take) / exec.shares : 0;
      const extId = sliceIdx === 0 ? exec.externalId : `${exec.externalId}#${sliceIdx}`;
      const saved = savedClosedMeta.get(extId);

      const closed = repo.closeOpenLotShares({
        openLotId: lot.id,
        sharesToClose: take,
        sellDate: exec.tradeDate,
        sellPriceUsd: exec.priceUsd,
        sellFeesUsd: saved?.sellFeesUsd ? saved.sellFeesUsd : feeShare,
        executionType: exec.executionType ?? "INSTANT",
        executionMode: exec.executionMode ?? (exec.executionType === "GTT" ? "GTT" : "Instant"),
        listName: saved?.listName ?? "Others",
        cmpUsd: saved?.cmpUsd ?? currentPricesInput[ticker] ?? null,
        strategy: saved?.strategy ?? (lot.strategy || ""),
        targetPriceUsd: saved?.targetPriceUsd ?? null,
        notes: saved?.notes || exec.notes || "",
        externalId: extId,
        source: "INDMONEY",
      });
      if (saved?.buyFeesUsd && saved.buyFeesUsd > 0 && closed.buyFeesUsd === 0) {
        repo.updateClosedTrade(closed.id, { buyFeesUsd: saved.buyFeesUsd });
      }
      remainingToSell -= take;
      sliceIdx++;
    }

    if (sliceIdx > 0) sellsMatched++;
    else sellsUnmatched++;
  }

  // 3. Reconcile open lots against INDmoney equity/summary holdings (splits + pre-history lots)
  for (const holding of brokerHoldingsInput) {
    const ticker = holding.ticker.toUpperCase();
    if (holding.quantity <= 0.000001) continue;

    const reconExtId = `ind:holding:${ticker}:recon`;
    const allTickerLots = repo
      .listOpenLots()
      .filter((l) => l.ticker.toUpperCase() === ticker && l.remainingShares > 0.000001);

    const reconLot = allTickerLots.find((l) => l.externalId === reconExtId) ?? null;
    const nonReconLots = allTickerLots.filter((l) => l.externalId !== reconExtId);

    let nonReconShares = 0;
    let nonReconInvested = 0;
    for (const lot of nonReconLots) {
      const ratio = lot.shares > 0 ? lot.remainingShares / lot.shares : 1;
      nonReconShares += lot.remainingShares;
      nonReconInvested += lot.buyValueUsd * ratio;
    }

    // 3a. Stock split detection: invested matches within $1, but share qty differs by > 1%
    const investedDiff = Math.abs(nonReconInvested - holding.investedAmountUsd);
    const shareDiffRatio =
      holding.quantity > 0 ? Math.abs(nonReconShares - holding.quantity) / holding.quantity : 0;

    if (nonReconShares > 0 && investedDiff <= 1.0 && shareDiffRatio > 0.01) {
      let lotsToScale = nonReconLots;
      let splitRatio = holding.quantity / nonReconShares;

      // If some lots were bought after the split (already near livePriceUsd),
      // only scale the pre-split lots so post-split buy prices/quantities stay accurate.
      if (holding.livePriceUsd > 0 && nonReconLots.length > 1) {
        const isForwardSplit = holding.quantity > nonReconShares;
        const preSplitLots = nonReconLots.filter((lot) =>
          isForwardSplit
            ? lot.buyPriceUsd > holding.livePriceUsd * 3
            : lot.buyPriceUsd * 3 < holding.livePriceUsd
        );
        const postSplitLots = nonReconLots.filter((lot) => !preSplitLots.includes(lot));
        if (preSplitLots.length > 0 && postSplitLots.length > 0) {
          const postSplitShares = postSplitLots.reduce((s, l) => s + l.remainingShares, 0);
          const preSplitShares = preSplitLots.reduce((s, l) => s + l.remainingShares, 0);
          const targetPreSplitShares = holding.quantity - postSplitShares;
          if (preSplitShares > 0 && targetPreSplitShares > 0) {
            lotsToScale = preSplitLots;
            splitRatio = targetPreSplitShares / preSplitShares;
          }
        }
      }

      for (const lot of lotsToScale) {
        const splitNote = `[Split x${splitRatio.toFixed(4)}]`;
        const nextNotes = lot.notes.includes("[Split x")
          ? lot.notes
          : `${lot.notes ? `${lot.notes} ` : ""}${splitNote}`;
        repo.updateOpenLot(lot.id, {
          shares: lot.shares * splitRatio,
          remainingShares: lot.remainingShares * splitRatio,
          buyPriceUsd: lot.buyPriceUsd / splitRatio,
          notes: nextNotes,
        });
      }
      if (reconLot) repo.deleteOpenLot(reconLot.id);
      splitsAdjusted++;
      continue;
    }

    // 3b. Missing / under-counted holdings from uncaptured Page 2+ orders
    const missingShares = holding.quantity - nonReconShares;
    const missingInvested = holding.investedAmountUsd - nonReconInvested;

    if (missingShares > 0.0001 && missingInvested > 0.01) {
      const avgBuy = missingInvested / missingShares;
      if (reconLot) {
        repo.updateOpenLot(reconLot.id, {
          companyName: holding.companyName,
          shares: missingShares,
          remainingShares: missingShares,
          buyPriceUsd: avgBuy,
          buyValueUsd: missingInvested,
          currentPriceUsd: holding.livePriceUsd > 0 ? holding.livePriceUsd : reconLot.currentPriceUsd,
        });
      } else {
        const savedRecon = savedLotMeta.get(reconExtId);
        repo.upsertOpenLotByExternalId({
          externalId: reconExtId,
          ticker,
          companyName: holding.companyName,
          buyDate: "2026-01-01",
          shares: missingShares,
          buyPriceUsd: avgBuy,
          buyValueUsd: missingInvested,
          strategy: savedRecon?.strategy ?? "",
          targetPriceUsd: savedRecon?.targetPriceUsd ?? null,
          sellGttPriceUsd: savedRecon?.sellGttPriceUsd ?? null,
          sellGttStatus: savedRecon?.sellGttStatus ?? "NONE",
          marketCapTier: savedRecon?.marketCapTier ?? null,
          currentPriceUsd: holding.livePriceUsd > 0 ? holding.livePriceUsd : null,
          notes:
            savedRecon?.notes ||
            "Reconciled from INDmoney holdings (pre-history / uncaptured order page)",
          source: "INDMONEY",
        });
      }
      reconLotsUpserted++;
    } else if (reconLot) {
      repo.deleteOpenLot(reconLot.id);
    }
  }

  // 4. Process Cashflows (dividends, standalone fees; deduplicate ±7 days for same type/ticker/amount)
  const existingCashflows = repo.listCashflows();
  for (const cf of cashflowsInput) {
    const isDupWindow =
      (cf.type === "DIVIDEND" || cf.type === "WITHHOLDING_TAX") &&
      existingCashflows.some((c) => {
        if (c.type !== cf.type) return false;
        if ((c.ticker ?? null) !== (cf.ticker ? cf.ticker.toUpperCase() : null)) return false;
        if (Math.abs(c.amountUsd - cf.amountUsd) > 0.01) return false;
        const d1 = new Date(c.eventDate).getTime();
        const d2 = new Date(cf.eventDate).getTime();
        return !Number.isNaN(d1) && !Number.isNaN(d2) && Math.abs(d1 - d2) / 86_400_000 <= 7;
      });
    if (isDupWindow) continue;
    const { created, event } = repo.upsertCashflowByExternalId(cf);
    if (created) {
      cashflowsCreated++;
      existingCashflows.push(event);
    }
  }

  // 4b. Process Running Wallet Transactions Ledger
  for (const wtx of walletTransactionsInput) {
    const { created } = repo.upsertWalletTransaction(wtx);
    if (created) walletTransactionsUpserted++;
  }

  // 5. Update current prices on all active open lots
  if (Object.keys(currentPricesInput).length > 0) {
    const lots = repo.listOpenLots();
    for (const lot of lots) {
      const price = currentPricesInput[lot.ticker.toUpperCase()];
      if (typeof price === "number" && price > 0) {
        repo.updateOpenLot(lot.id, { currentPriceUsd: price });
        pricesUpdated++;
      }
    }
  }

  repo.updateSettings({
    lastSyncedAt: new Date().toISOString(),
    syncSource: payload.source ?? "INDMONEY_EXTENSION",
  });

  return {
    buysCreated,
    buysSkipped,
    sellsMatched,
    sellsUnmatched,
    depositsCreated,
    cashflowsCreated,
    walletTransactionsUpserted,
    pricesUpdated,
    splitsAdjusted,
    reconLotsUpserted,
  };
}
