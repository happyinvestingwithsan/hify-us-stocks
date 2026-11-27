import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { daysBetween } from "./profit-engine";
import {
  CreateBrokerOrderInput,
  CreateCashflowInput,
  CreateClosedTradeInput,
  CreateDepositInput,
  CreateOpenLotInput,
  CreateOpportunityInput,
  CreateWalletTransactionInput,
  JournalRepository,
  UpdateClosedTradeInput,
  UpdateDepositInput,
  UpdateOpenLotInput,
  UpdateOpportunityInput,
} from "./repository";
import {
  AccountSettings,
  BrokerOrder,
  BrokerOrderDecisionStatus,
  BrokerOrderStatus,
  CashflowEvent,
  ClosedTrade,
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
} from "./types";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "us_stocks_journal.db");

export class SqliteJournalRepository implements JournalRepository {
  private db: DatabaseSync;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS account_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        target_capital_usd REAL NOT NULL DEFAULT 5000,
        live_usd_inr_rate REAL NOT NULL DEFAULT 85.0,
        last_synced_at TEXT,
        sync_source TEXT,
        broker_cash_usd REAL NOT NULL DEFAULT 0,
        broker_invested_usd REAL NOT NULL DEFAULT 0,
        broker_current_value_usd REAL NOT NULL DEFAULT 0,
        broker_pnl_usd REAL NOT NULL DEFAULT 0,
        broker_holdings_count INTEGER NOT NULL DEFAULT 0
      );

      INSERT OR IGNORE INTO account_settings (id, target_capital_usd, live_usd_inr_rate)
      VALUES (1, 5000, 85.0);

      CREATE TABLE IF NOT EXISTS inr_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        deposit_date TEXT NOT NULL,
        inr_amount REAL NOT NULL,
        fx_rate REAL NOT NULL,
        fx_charges_inr REAL NOT NULL DEFAULT 0,
        usd_credited REAL NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS open_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        ticker TEXT NOT NULL,
        company_name TEXT NOT NULL,
        buy_date TEXT NOT NULL,
        shares REAL NOT NULL,
        remaining_shares REAL NOT NULL,
        buy_price_usd REAL NOT NULL,
        buy_value_usd REAL NOT NULL,
        fees_usd REAL NOT NULL DEFAULT 0,
        strategy TEXT NOT NULL DEFAULT '',
        target_price_usd REAL,
        sell_gtt_price_usd REAL,
        sell_gtt_status TEXT NOT NULL DEFAULT 'NONE',
        market_cap_tier TEXT,
        current_price_usd REAL,
        notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'MANUAL'
      );

      CREATE TABLE IF NOT EXISTS closed_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        open_lot_id INTEGER REFERENCES open_lots(id) ON DELETE SET NULL,
        ticker TEXT NOT NULL,
        company_name TEXT NOT NULL,
        buy_date TEXT NOT NULL,
        sell_date TEXT NOT NULL,
        shares REAL NOT NULL,
        buy_price_usd REAL NOT NULL,
        buy_value_usd REAL NOT NULL,
        sell_price_usd REAL NOT NULL,
        sell_value_usd REAL NOT NULL,
        buy_fees_usd REAL NOT NULL DEFAULT 0,
        sell_fees_usd REAL NOT NULL DEFAULT 0,
        gross_pnl_usd REAL NOT NULL,
        net_pnl_usd REAL NOT NULL,
        pnl_pct REAL NOT NULL,
        days_held INTEGER NOT NULL DEFAULT 0,
        strategy TEXT NOT NULL DEFAULT '',
        target_price_usd REAL,
        execution_type TEXT NOT NULL DEFAULT 'INSTANT',
        notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'MANUAL'
      );

      CREATE TABLE IF NOT EXISTS cashflow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        event_date TEXT NOT NULL,
        type TEXT NOT NULL,
        ticker TEXT,
        amount_usd REAL NOT NULL,
        amount_inr REAL NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL UNIQUE,
        tx_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_usd REAL NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL UNIQUE,
        company_name TEXT NOT NULL,
        leader_mention TEXT NOT NULL DEFAULT '',
        market_cap_tier TEXT,
        current_price_usd REAL,
        planned_order_type TEXT NOT NULL DEFAULT '90D_TRIGGER',
        trigger_price_usd REAL,
        target_capital_usd REAL,
        planned_shares REAL,
        action_type TEXT NOT NULL DEFAULT 'WATCH',
        action_due_date TEXT,
        action_status TEXT NOT NULL DEFAULT 'PENDING',
        snoozed_until TEXT,
        thesis_notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'MANUAL',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS broker_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL UNIQUE,
        ticker TEXT NOT NULL,
        company_name TEXT NOT NULL DEFAULT '',
        side TEXT NOT NULL,
        order_type TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        cancellation_reason TEXT NOT NULL DEFAULT '',
        shares REAL NOT NULL DEFAULT 0,
        price_usd REAL NOT NULL DEFAULT 0,
        value_usd REAL NOT NULL DEFAULT 0,
        order_date TEXT NOT NULL,
        expiry_date TEXT,
        decision_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        snoozed_until TEXT,
        notes TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS action_snoozes (
        action_key TEXT PRIMARY KEY,
        snoozed_until TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("account_settings", "broker_cash_usd", "REAL NOT NULL DEFAULT 0");
    this.ensureColumn("account_settings", "broker_invested_usd", "REAL NOT NULL DEFAULT 0");
    this.ensureColumn("account_settings", "broker_current_value_usd", "REAL NOT NULL DEFAULT 0");
    this.ensureColumn("account_settings", "broker_pnl_usd", "REAL NOT NULL DEFAULT 0");
    this.ensureColumn("account_settings", "broker_holdings_count", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("inr_deposits", "external_id", "TEXT");
    this.ensureColumn("open_lots", "target_price_usd", "REAL");
    this.ensureColumn("open_lots", "execution_mode", "TEXT NOT NULL DEFAULT 'Instant'");
    this.ensureColumn("open_lots", "list_name", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("open_lots", "prev_close_usd", "REAL");
    this.ensureColumn("open_lots", "today_change_pct", "REAL");
    this.ensureColumn("open_lots", "ath_price_usd", "REAL");
    this.ensureColumn("open_lots", "quote_source", "TEXT");
    this.ensureColumn("open_lots", "quote_updated_at", "TEXT");
    this.ensureColumn("open_lots", "lrd", "TEXT");
    this.ensureColumn("closed_trades", "target_price_usd", "REAL");
    this.ensureColumn("closed_trades", "execution_mode", "TEXT NOT NULL DEFAULT 'Instant'");
    this.ensureColumn("closed_trades", "list_name", "TEXT NOT NULL DEFAULT 'Others'");
    this.ensureColumn("closed_trades", "cmp_usd", "REAL");
    this.ensureColumn("opportunities", "strategy", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("broker_orders", "strategy", "TEXT NOT NULL DEFAULT ''");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_inr_deposits_external_id ON inr_deposits(external_id);");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }

  getSettings(): AccountSettings {
    const row = this.db
      .prepare(
        `SELECT target_capital_usd, live_usd_inr_rate, last_synced_at, sync_source,
                broker_cash_usd, broker_invested_usd, broker_current_value_usd,
                broker_pnl_usd, broker_holdings_count
         FROM account_settings WHERE id = 1`
      )
      .get() as Record<string, unknown>;
    return {
      targetCapitalUsd: Number(row.target_capital_usd),
      liveUsdInrRate: Number(row.live_usd_inr_rate),
      lastSyncedAt: (row.last_synced_at as string | null) ?? null,
      syncSource: (row.sync_source as string | null) ?? null,
      brokerCashUsd: Number(row.broker_cash_usd ?? 0),
      brokerInvestedUsd: Number(row.broker_invested_usd ?? 0),
      brokerCurrentValueUsd: Number(row.broker_current_value_usd ?? 0),
      brokerPnlUsd: Number(row.broker_pnl_usd ?? 0),
      brokerHoldingsCount: Number(row.broker_holdings_count ?? 0),
    };
  }

  updateSettings(patch: Partial<AccountSettings>): AccountSettings {
    const current = this.getSettings();
    const next: AccountSettings = {
      targetCapitalUsd: patch.targetCapitalUsd ?? current.targetCapitalUsd,
      liveUsdInrRate: patch.liveUsdInrRate ?? current.liveUsdInrRate,
      lastSyncedAt: patch.lastSyncedAt !== undefined ? patch.lastSyncedAt : current.lastSyncedAt,
      syncSource: patch.syncSource !== undefined ? patch.syncSource : current.syncSource,
      brokerCashUsd: patch.brokerCashUsd ?? current.brokerCashUsd,
      brokerInvestedUsd: patch.brokerInvestedUsd ?? current.brokerInvestedUsd,
      brokerCurrentValueUsd: patch.brokerCurrentValueUsd ?? current.brokerCurrentValueUsd,
      brokerPnlUsd: patch.brokerPnlUsd ?? current.brokerPnlUsd,
      brokerHoldingsCount: patch.brokerHoldingsCount ?? current.brokerHoldingsCount,
    };
    this.db
      .prepare(
        `UPDATE account_settings
         SET target_capital_usd = ?, live_usd_inr_rate = ?, last_synced_at = ?, sync_source = ?,
             broker_cash_usd = ?, broker_invested_usd = ?, broker_current_value_usd = ?,
             broker_pnl_usd = ?, broker_holdings_count = ?
         WHERE id = 1`
      )
      .run(
        next.targetCapitalUsd,
        next.liveUsdInrRate,
        next.lastSyncedAt,
        next.syncSource,
        next.brokerCashUsd,
        next.brokerInvestedUsd,
        next.brokerCurrentValueUsd,
        next.brokerPnlUsd,
        next.brokerHoldingsCount
      );
    return next;
  }

  private mapDeposit(r: Record<string, unknown>): InrDeposit {
    return {
      id: Number(r.id),
      externalId: (r.external_id as string | null) ?? null,
      depositDate: String(r.deposit_date),
      inrAmount: Number(r.inr_amount),
      fxRate: Number(r.fx_rate),
      fxChargesInr: Number(r.fx_charges_inr),
      usdCredited: Number(r.usd_credited),
      notes: String(r.notes ?? ""),
    };
  }

  listDeposits(): InrDeposit[] {
    const rows = this.db
      .prepare("SELECT * FROM inr_deposits ORDER BY deposit_date DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapDeposit(r));
  }

  addDeposit(input: CreateDepositInput): InrDeposit {
    const res = this.db
      .prepare(
        `INSERT INTO inr_deposits (external_id, deposit_date, inr_amount, fx_rate, fx_charges_inr, usd_credited, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.externalId ?? null,
        input.depositDate,
        input.inrAmount,
        input.fxRate,
        input.fxChargesInr ?? 0,
        input.usdCredited,
        input.notes ?? ""
      );
    const id = Number(res.lastInsertRowid);
    return {
      id,
      externalId: input.externalId ?? null,
      depositDate: input.depositDate,
      inrAmount: input.inrAmount,
      fxRate: input.fxRate,
      fxChargesInr: input.fxChargesInr ?? 0,
      usdCredited: input.usdCredited,
      notes: input.notes ?? "",
    };
  }

  upsertDepositByExternalId(input: CreateDepositInput): { deposit: InrDeposit; created: boolean } {
    if (input.externalId) {
      const existing = this.db
        .prepare("SELECT * FROM inr_deposits WHERE external_id = ?")
        .get(input.externalId) as Record<string, unknown> | undefined;
      if (existing) {
        return { deposit: this.mapDeposit(existing), created: false };
      }
    }
    return { deposit: this.addDeposit(input), created: true };
  }

  updateDeposit(id: number, patch: UpdateDepositInput): InrDeposit | null {
    const existingRow = this.db
      .prepare("SELECT * FROM inr_deposits WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!existingRow) return null;
    const existing = this.mapDeposit(existingRow);

    this.db
      .prepare(
        `UPDATE inr_deposits
         SET inr_amount = ?, fx_rate = ?, fx_charges_inr = ?, usd_credited = ?, notes = ?
         WHERE id = ?`
      )
      .run(
        patch.inrAmount ?? existing.inrAmount,
        patch.fxRate ?? existing.fxRate,
        patch.fxChargesInr ?? existing.fxChargesInr,
        patch.usdCredited ?? existing.usdCredited,
        patch.notes ?? existing.notes,
        id
      );

    const updated = this.db.prepare("SELECT * FROM inr_deposits WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    return this.mapDeposit(updated);
  }

  deleteDeposit(id: number): void {
    this.db.prepare("DELETE FROM inr_deposits WHERE id = ?").run(id);
  }

  private mapOpenLot(r: Record<string, unknown>): OpenLot {
    return {
      id: Number(r.id),
      externalId: (r.external_id as string | null) ?? null,
      ticker: String(r.ticker),
      companyName: String(r.company_name),
      buyDate: String(r.buy_date),
      shares: Number(r.shares),
      remainingShares: Number(r.remaining_shares),
      buyPriceUsd: Number(r.buy_price_usd),
      buyValueUsd: Number(r.buy_value_usd),
      feesUsd: Number(r.fees_usd),
      strategy: String(r.strategy ?? ""),
      targetPriceUsd: r.target_price_usd !== null ? Number(r.target_price_usd) : null,
      sellGttPriceUsd: r.sell_gtt_price_usd !== null ? Number(r.sell_gtt_price_usd) : null,
      sellGttStatus: String(r.sell_gtt_status ?? "NONE") as OpenLot["sellGttStatus"],
      marketCapTier: (r.market_cap_tier as OpenLot["marketCapTier"]) ?? null,
      currentPriceUsd: r.current_price_usd !== null ? Number(r.current_price_usd) : null,
      executionMode: (String(r.execution_mode ?? "Instant") === "GTT" ? "GTT" : "Instant") as OpenLot["executionMode"],
      listName: String(r.list_name ?? ""),
      prevCloseUsd: r.prev_close_usd !== null && r.prev_close_usd !== undefined ? Number(r.prev_close_usd) : null,
      todayChangePct: r.today_change_pct !== null && r.today_change_pct !== undefined ? Number(r.today_change_pct) : null,
      athPriceUsd: r.ath_price_usd !== null && r.ath_price_usd !== undefined ? Number(r.ath_price_usd) : null,
      quoteSource: (r.quote_source as QuoteSource | null) ?? null,
      quoteUpdatedAt: (r.quote_updated_at as string | null) ?? null,
      lrd: (r.lrd as string | null) ?? null,
      notes: String(r.notes ?? ""),
      source: String(r.source ?? "MANUAL") as OpenLot["source"],
    };
  }

  listOpenLots(): OpenLot[] {
    const rows = this.db
      .prepare("SELECT * FROM open_lots WHERE remaining_shares > 0.000001 ORDER BY buy_date DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapOpenLot(r));
  }

  listAllOpenLots(): OpenLot[] {
    const rows = this.db
      .prepare("SELECT * FROM open_lots ORDER BY buy_date DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapOpenLot(r));
  }

  getOpenLot(id: number): OpenLot | null {
    const row = this.db.prepare("SELECT * FROM open_lots WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapOpenLot(row) : null;
  }

  upsertOpenLotByExternalId(input: CreateOpenLotInput): { lot: OpenLot; created: boolean } {
    if (input.externalId) {
      const existing = this.db
        .prepare("SELECT * FROM open_lots WHERE external_id = ?")
        .get(input.externalId) as Record<string, unknown> | undefined;
      if (existing) {
        return { lot: this.mapOpenLot(existing), created: false };
      }
    }

    const res = this.db
      .prepare(
        `INSERT INTO open_lots (
          external_id, ticker, company_name, buy_date, shares, remaining_shares,
          buy_price_usd, buy_value_usd, fees_usd, strategy, target_price_usd,
          sell_gtt_price_usd, sell_gtt_status, market_cap_tier, current_price_usd,
          execution_mode, list_name, prev_close_usd, today_change_pct, ath_price_usd,
          quote_source, quote_updated_at, lrd, notes, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.externalId ?? null,
        input.ticker.toUpperCase(),
        input.companyName,
        input.buyDate,
        input.shares,
        input.shares,
        input.buyPriceUsd,
        input.buyValueUsd,
        input.feesUsd ?? 0,
        input.strategy ?? "",
        input.targetPriceUsd ?? null,
        input.sellGttPriceUsd ?? null,
        input.sellGttStatus ?? "NONE",
        input.marketCapTier ?? null,
        input.currentPriceUsd ?? null,
        input.executionMode ?? "Instant",
        input.listName ?? "",
        input.prevCloseUsd ?? null,
        input.todayChangePct ?? null,
        input.athPriceUsd ?? null,
        input.quoteSource ?? null,
        input.quoteUpdatedAt ?? null,
        input.lrd ?? null,
        input.notes ?? "",
        input.source
      );

    const created = this.getOpenLot(Number(res.lastInsertRowid))!;
    return { lot: created, created: true };
  }

  updateOpenLot(id: number, patch: UpdateOpenLotInput): OpenLot | null {
    const existing = this.getOpenLot(id);
    if (!existing) return null;

    this.db
      .prepare(
        `UPDATE open_lots
         SET company_name = ?, shares = ?, remaining_shares = ?, buy_price_usd = ?,
             buy_value_usd = ?, fees_usd = ?, strategy = ?, target_price_usd = ?,
             sell_gtt_price_usd = ?, sell_gtt_status = ?, market_cap_tier = ?,
             current_price_usd = ?, list_name = ?, prev_close_usd = ?, today_change_pct = ?,
             ath_price_usd = ?, quote_source = ?, quote_updated_at = ?, lrd = ?, notes = ?
         WHERE id = ?`
      )
      .run(
        patch.companyName ?? existing.companyName,
        patch.shares ?? existing.shares,
        patch.remainingShares ?? existing.remainingShares,
        patch.buyPriceUsd ?? existing.buyPriceUsd,
        patch.buyValueUsd ?? existing.buyValueUsd,
        patch.feesUsd ?? existing.feesUsd,
        patch.strategy ?? existing.strategy,
        patch.targetPriceUsd !== undefined ? patch.targetPriceUsd : existing.targetPriceUsd,
        patch.sellGttPriceUsd !== undefined ? patch.sellGttPriceUsd : existing.sellGttPriceUsd,
        patch.sellGttStatus ?? existing.sellGttStatus,
        patch.marketCapTier !== undefined ? patch.marketCapTier : existing.marketCapTier,
        patch.currentPriceUsd !== undefined ? patch.currentPriceUsd : existing.currentPriceUsd,
        patch.listName ?? existing.listName,
        patch.prevCloseUsd !== undefined ? patch.prevCloseUsd : existing.prevCloseUsd,
        patch.todayChangePct !== undefined ? patch.todayChangePct : existing.todayChangePct,
        patch.athPriceUsd !== undefined ? patch.athPriceUsd : existing.athPriceUsd,
        patch.quoteSource !== undefined ? patch.quoteSource : existing.quoteSource,
        patch.quoteUpdatedAt !== undefined ? patch.quoteUpdatedAt : existing.quoteUpdatedAt,
        patch.lrd !== undefined ? patch.lrd : existing.lrd,
        patch.notes ?? existing.notes,
        id
      );

    return this.getOpenLot(id);
  }

  async updateQuotesForTicker(
    ticker: string,
    quote: {
      currentPriceUsd: number;
      prevCloseUsd: number | null;
      todayChangePct: number | null;
      athPriceUsd: number | null;
      quoteSource: QuoteSource;
      quoteUpdatedAt: string;
    }
  ): Promise<number> {
    const upperTicker = ticker.trim().toUpperCase();
    if (!upperTicker) return 0;

    const openLotsRes = this.db
      .prepare(
        `UPDATE open_lots
         SET current_price_usd = ?, prev_close_usd = ?, today_change_pct = ?,
             ath_price_usd = ?, quote_source = ?, quote_updated_at = ?
         WHERE UPPER(ticker) = ?`
      )
      .run(
        quote.currentPriceUsd,
        quote.prevCloseUsd,
        quote.todayChangePct,
        quote.athPriceUsd,
        quote.quoteSource,
        quote.quoteUpdatedAt,
        upperTicker
      );

    const oppsRes = this.db
      .prepare(
        `UPDATE opportunities
         SET current_price_usd = ?, updated_at = ?
         WHERE UPPER(ticker) = ?`
      )
      .run(quote.currentPriceUsd, quote.quoteUpdatedAt, upperTicker);

    return Number(openLotsRes.changes) + Number(oppsRes.changes);
  }

  deleteOpenLot(id: number): void {
    this.db.prepare("DELETE FROM open_lots WHERE id = ?").run(id);
  }

  deleteIndmoneyTrades(): void {
    this.db.exec(`
      DELETE FROM closed_trades WHERE source = 'INDMONEY';
      DELETE FROM open_lots WHERE source = 'INDMONEY';
    `);
  }

  closeOpenLotShares(params: {
    openLotId: number;
    sharesToClose: number;
    sellDate: string;
    sellPriceUsd: number;
    sellFeesUsd?: number;
    executionType?: ClosedTrade["executionType"];
    executionMode?: ClosedTrade["executionMode"];
    listName?: string;
    cmpUsd?: number | null;
    strategy?: string;
    targetPriceUsd?: number | null;
    notes?: string;
    externalId?: string | null;
    source?: ClosedTrade["source"];
  }): ClosedTrade {
    const lot = this.getOpenLot(params.openLotId);
    if (!lot) throw new Error(`Open lot ${params.openLotId} not found`);
    if (params.sharesToClose <= 0 || params.sharesToClose > lot.remainingShares + 0.000001) {
      throw new Error(
        `Invalid sharesToClose (${params.sharesToClose}); remaining shares = ${lot.remainingShares}`
      );
    }

    const closedQty = Math.min(params.sharesToClose, lot.remainingShares);
    const ratio = lot.shares > 0 ? closedQty / lot.shares : 1;
    const buyValueUsd = lot.buyValueUsd * ratio;
    const buyFeesUsd = lot.feesUsd * ratio;
    const sellValueUsd = closedQty * params.sellPriceUsd;
    const sellFeesUsd = params.sellFeesUsd ?? 0;
    const remainingAfter = Math.max(0, Math.round((lot.remainingShares - closedQty) * 1_000_000) / 1_000_000);

    this.db
      .prepare("UPDATE open_lots SET remaining_shares = ? WHERE id = ?")
      .run(remainingAfter, lot.id);

    const { trade } = this.upsertClosedTradeByExternalId({
      externalId: params.externalId ?? null,
      openLotId: lot.id,
      ticker: lot.ticker,
      companyName: lot.companyName,
      buyDate: lot.buyDate,
      sellDate: params.sellDate,
      shares: closedQty,
      buyPriceUsd: lot.buyPriceUsd,
      buyValueUsd,
      sellPriceUsd: params.sellPriceUsd,
      sellValueUsd,
      buyFeesUsd,
      sellFeesUsd,
      strategy: params.strategy !== undefined ? params.strategy : lot.strategy,
      targetPriceUsd: params.targetPriceUsd !== undefined ? params.targetPriceUsd : lot.targetPriceUsd,
      executionType: params.executionType ?? "INSTANT",
      executionMode: params.executionMode ?? (params.executionType === "GTT" ? "GTT" : lot.executionMode),
      listName: params.listName ?? "Others",
      cmpUsd: params.cmpUsd !== undefined ? params.cmpUsd : lot.currentPriceUsd,
      notes: params.notes ?? lot.notes,
      source: params.source ?? "MANUAL",
    });

    return trade;
  }

  private mapClosedTrade(r: Record<string, unknown>): ClosedTrade {
    return {
      id: Number(r.id),
      externalId: (r.external_id as string | null) ?? null,
      openLotId: r.open_lot_id !== null ? Number(r.open_lot_id) : null,
      ticker: String(r.ticker),
      companyName: String(r.company_name),
      buyDate: String(r.buy_date),
      sellDate: String(r.sell_date),
      shares: Number(r.shares),
      buyPriceUsd: Number(r.buy_price_usd),
      buyValueUsd: Number(r.buy_value_usd),
      sellPriceUsd: Number(r.sell_price_usd),
      sellValueUsd: Number(r.sell_value_usd),
      buyFeesUsd: Number(r.buy_fees_usd),
      sellFeesUsd: Number(r.sell_fees_usd),
      grossPnlUsd: Number(r.gross_pnl_usd),
      netPnlUsd: Number(r.net_pnl_usd),
      pnlPct: Number(r.pnl_pct),
      daysHeld: Number(r.days_held),
      strategy: String(r.strategy ?? ""),
      targetPriceUsd: r.target_price_usd !== null ? Number(r.target_price_usd) : null,
      executionType: String(r.execution_type ?? "INSTANT") as ClosedTrade["executionType"],
      executionMode: (String(r.execution_mode ?? (r.execution_type === "GTT" ? "GTT" : "Instant")) === "GTT"
        ? "GTT"
        : "Instant") as ClosedTrade["executionMode"],
      listName: String(r.list_name ?? "Others"),
      cmpUsd: r.cmp_usd !== null && r.cmp_usd !== undefined ? Number(r.cmp_usd) : null,
      notes: String(r.notes ?? ""),
      source: String(r.source ?? "MANUAL") as ClosedTrade["source"],
    };
  }

  listClosedTrades(): ClosedTrade[] {
    const rows = this.db
      .prepare("SELECT * FROM closed_trades ORDER BY sell_date DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapClosedTrade(r));
  }

  getClosedTrade(id: number): ClosedTrade | null {
    const row = this.db.prepare("SELECT * FROM closed_trades WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapClosedTrade(row) : null;
  }

  updateClosedTrade(id: number, patch: UpdateClosedTradeInput): ClosedTrade | null {
    const existing = this.getClosedTrade(id);
    if (!existing) return null;

    const buyFeesUsd = patch.buyFeesUsd ?? existing.buyFeesUsd;
    const sellFeesUsd = patch.sellFeesUsd ?? existing.sellFeesUsd;
    const netPnlUsd = existing.grossPnlUsd - buyFeesUsd - sellFeesUsd;
    const pnlPct = existing.buyValueUsd > 0 ? (netPnlUsd / existing.buyValueUsd) * 100 : 0;

    this.db
      .prepare(
        `UPDATE closed_trades
         SET strategy = ?, target_price_usd = ?, cmp_usd = ?, list_name = ?,
             execution_mode = ?, buy_fees_usd = ?, sell_fees_usd = ?,
             net_pnl_usd = ?, pnl_pct = ?, notes = ?
         WHERE id = ?`
      )
      .run(
        patch.strategy ?? existing.strategy,
        patch.targetPriceUsd !== undefined ? patch.targetPriceUsd : existing.targetPriceUsd,
        patch.cmpUsd !== undefined ? patch.cmpUsd : existing.cmpUsd,
        patch.listName ?? existing.listName,
        patch.executionMode ?? existing.executionMode,
        buyFeesUsd,
        sellFeesUsd,
        netPnlUsd,
        pnlPct,
        patch.notes ?? existing.notes,
        id
      );

    return this.getClosedTrade(id);
  }

  upsertClosedTradeByExternalId(input: CreateClosedTradeInput): { trade: ClosedTrade; created: boolean } {
    if (input.externalId) {
      const existing = this.db
        .prepare("SELECT * FROM closed_trades WHERE external_id = ?")
        .get(input.externalId) as Record<string, unknown> | undefined;
      if (existing) {
        return { trade: this.mapClosedTrade(existing), created: false };
      }
    }

    const buyFeesUsd = input.buyFeesUsd ?? 0;
    const sellFeesUsd = input.sellFeesUsd ?? 0;
    const grossPnlUsd = input.sellValueUsd - input.buyValueUsd;
    const netPnlUsd = grossPnlUsd - buyFeesUsd - sellFeesUsd;
    const pnlPct = input.buyValueUsd > 0 ? (netPnlUsd / input.buyValueUsd) * 100 : 0;
    const daysHeld = daysBetween(input.buyDate, input.sellDate);

    const res = this.db
      .prepare(
        `INSERT INTO closed_trades (
          external_id, open_lot_id, ticker, company_name, buy_date, sell_date, shares,
          buy_price_usd, buy_value_usd, sell_price_usd, sell_value_usd,
          buy_fees_usd, sell_fees_usd, gross_pnl_usd, net_pnl_usd, pnl_pct, days_held,
          strategy, target_price_usd, execution_type, execution_mode, list_name, cmp_usd,
          notes, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.externalId ?? null,
        input.openLotId ?? null,
        input.ticker.toUpperCase(),
        input.companyName,
        input.buyDate,
        input.sellDate,
        input.shares,
        input.buyPriceUsd,
        input.buyValueUsd,
        input.sellPriceUsd,
        input.sellValueUsd,
        buyFeesUsd,
        sellFeesUsd,
        grossPnlUsd,
        netPnlUsd,
        pnlPct,
        daysHeld,
        input.strategy ?? "",
        input.targetPriceUsd ?? null,
        input.executionType ?? "INSTANT",
        input.executionMode ?? (input.executionType === "GTT" ? "GTT" : "Instant"),
        input.listName ?? "Others",
        input.cmpUsd ?? null,
        input.notes ?? "",
        input.source
      );

    const row = this.db
      .prepare("SELECT * FROM closed_trades WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return { trade: this.mapClosedTrade(row), created: true };
  }

  listCashflows(): CashflowEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM cashflow_events ORDER BY event_date DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: Number(r.id),
      externalId: (r.external_id as string | null) ?? null,
      eventDate: String(r.event_date),
      type: String(r.type) as CashflowEvent["type"],
      ticker: (r.ticker as string | null) ?? null,
      amountUsd: Number(r.amount_usd),
      amountInr: Number(r.amount_inr),
      notes: String(r.notes ?? ""),
    }));
  }

  upsertCashflowByExternalId(input: CreateCashflowInput): { event: CashflowEvent; created: boolean } {
    if (input.externalId) {
      const existing = this.db
        .prepare("SELECT * FROM cashflow_events WHERE external_id = ?")
        .get(input.externalId) as Record<string, unknown> | undefined;
      if (existing) {
        return {
          event: {
            id: Number(existing.id),
            externalId: (existing.external_id as string | null) ?? null,
            eventDate: String(existing.event_date),
            type: String(existing.type) as CashflowEvent["type"],
            ticker: (existing.ticker as string | null) ?? null,
            amountUsd: Number(existing.amount_usd),
            amountInr: Number(existing.amount_inr),
            notes: String(existing.notes ?? ""),
          },
          created: false,
        };
      }
    }

    const res = this.db
      .prepare(
        `INSERT INTO cashflow_events (external_id, event_date, type, ticker, amount_usd, amount_inr, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.externalId ?? null,
        input.eventDate,
        input.type,
        input.ticker ? input.ticker.toUpperCase() : null,
        input.amountUsd,
        input.amountInr ?? 0,
        input.notes ?? ""
      );

    return {
      event: {
        id: Number(res.lastInsertRowid),
        externalId: input.externalId ?? null,
        eventDate: input.eventDate,
        type: input.type,
        ticker: input.ticker ? input.ticker.toUpperCase() : null,
        amountUsd: input.amountUsd,
        amountInr: input.amountInr ?? 0,
        notes: input.notes ?? "",
      },
      created: true,
    };
  }

  deleteCashflow(id: number): void {
    this.db.prepare("DELETE FROM cashflow_events WHERE id = ?").run(id);
  }

  private mapWalletTransaction(r: Record<string, unknown>): WalletTransaction {
    return {
      id: Number(r.id),
      externalId: String(r.external_id),
      txDate: String(r.tx_date),
      createdAt: String(r.created_at),
      title: String(r.title),
      category: String(r.category) as WalletTransaction["category"],
      amountUsd: Number(r.amount_usd),
      status: String(r.status),
      notes: String(r.notes ?? ""),
      rawJson: String(r.raw_json ?? ""),
    };
  }

  listWalletTransactions(): WalletTransaction[] {
    const rows = this.db
      .prepare("SELECT * FROM wallet_transactions ORDER BY created_at DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapWalletTransaction(r));
  }

  upsertWalletTransaction(
    input: CreateWalletTransactionInput
  ): { tx: WalletTransaction; created: boolean } {
    const existing = this.db
      .prepare("SELECT * FROM wallet_transactions WHERE external_id = ?")
      .get(input.externalId) as Record<string, unknown> | undefined;

    if (existing) {
      return { tx: this.mapWalletTransaction(existing), created: false };
    }

    const res = this.db
      .prepare(
        `INSERT INTO wallet_transactions (
          external_id, tx_date, created_at, title, category, amount_usd, status, notes, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.externalId,
        input.txDate,
        input.createdAt,
        input.title,
        input.category,
        input.amountUsd,
        input.status,
        input.notes ?? "",
        input.rawJson ?? ""
      );

    const row = this.db
      .prepare("SELECT * FROM wallet_transactions WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return { tx: this.mapWalletTransaction(row), created: true };
  }

  private mapStrategy(r: Record<string, unknown>): Strategy {
    return {
      id: Number(r.id),
      name: String(r.name),
      description: String(r.description ?? ""),
      isActive: Number(r.is_active ?? 1) === 1,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  listStrategies(): Strategy[] {
    const rows = this.db
      .prepare("SELECT * FROM strategies ORDER BY is_active DESC, name COLLATE NOCASE ASC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapStrategy(r));
  }

  createStrategy(input: { name: string; description?: string }): Strategy {
    const cleanName = input.name.trim();
    if (!cleanName) {
      throw new Error("Strategy name is required");
    }
    const existing = this.db
      .prepare("SELECT * FROM strategies WHERE LOWER(name) = LOWER(?)")
      .get(cleanName) as Record<string, unknown> | undefined;
    if (existing) {
      return this.mapStrategy(existing);
    }
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO strategies (name, description, is_active, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?)`
      )
      .run(cleanName, (input.description ?? "").trim(), now, now);
    const row = this.db
      .prepare("SELECT * FROM strategies WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return this.mapStrategy(row);
  }

  updateStrategy(
    id: number,
    patch: { name?: string; description?: string; isActive?: boolean }
  ): Strategy | null {
    const existing = this.db
      .prepare("SELECT * FROM strategies WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const current = this.mapStrategy(existing);
    const nextName = patch.name !== undefined ? patch.name.trim() : current.name;
    if (!nextName) {
      throw new Error("Strategy name cannot be empty");
    }
    const nextDesc = patch.description !== undefined ? patch.description.trim() : current.description;
    const nextActive = patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : current.isActive ? 1 : 0;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE strategies
         SET name = ?, description = ?, is_active = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(nextName, nextDesc, nextActive, now, id);

    const row = this.db.prepare("SELECT * FROM strategies WHERE id = ?").get(id) as Record<string, unknown>;
    return this.mapStrategy(row);
  }

  deleteStrategy(id: number): void {
    this.db.prepare("DELETE FROM strategies WHERE id = ?").run(id);
  }

  private mapOpportunity(r: Record<string, unknown>): Opportunity {
    return {
      id: Number(r.id),
      ticker: String(r.ticker),
      companyName: String(r.company_name),
      leaderMention: String(r.leader_mention ?? ""),
      strategy: String(r.strategy ?? ""),
      marketCapTier: (r.market_cap_tier as MarketCapTier | null) ?? null,
      currentPriceUsd: r.current_price_usd !== null && r.current_price_usd !== undefined ? Number(r.current_price_usd) : null,
      plannedOrderType: (String(r.planned_order_type || "90D_TRIGGER") as OrderTypeOption),
      triggerPriceUsd: r.trigger_price_usd !== null && r.trigger_price_usd !== undefined ? Number(r.trigger_price_usd) : null,
      targetCapitalUsd: r.target_capital_usd !== null && r.target_capital_usd !== undefined ? Number(r.target_capital_usd) : null,
      plannedShares: r.planned_shares !== null && r.planned_shares !== undefined ? Number(r.planned_shares) : null,
      actionType: String(r.action_type || "WATCH") as OpportunityActionType,
      actionDueDate: (r.action_due_date as string | null) ?? null,
      actionStatus: String(r.action_status || "PENDING") as OpportunityActionStatus,
      snoozedUntil: (r.snoozed_until as string | null) ?? null,
      thesisNotes: String(r.thesis_notes ?? ""),
      source: String(r.source || "MANUAL") as Opportunity["source"],
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  listOpportunities(): Opportunity[] {
    const rows = this.db
      .prepare("SELECT * FROM opportunities ORDER BY updated_at DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapOpportunity(r));
  }

  getOpportunity(id: number): Opportunity | null {
    const row = this.db
      .prepare("SELECT * FROM opportunities WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapOpportunity(row) : null;
  }

  upsertOpportunityByTicker(input: CreateOpportunityInput): { opportunity: Opportunity; created: boolean } {
    const normTicker = input.ticker.trim().toUpperCase();
    const existing = this.db
      .prepare("SELECT * FROM opportunities WHERE ticker = ?")
      .get(normTicker) as Record<string, unknown> | undefined;

    const now = new Date().toISOString();
    const triggerPrice = input.triggerPriceUsd ?? null;
    const targetCapital = input.targetCapitalUsd ?? null;
    const plannedShares =
      input.plannedShares !== undefined
        ? input.plannedShares
        : triggerPrice && triggerPrice > 0 && targetCapital && targetCapital > 0
          ? Number((targetCapital / triggerPrice).toFixed(6))
          : null;

    if (existing) {
      this.db
        .prepare(
          `UPDATE opportunities
           SET company_name = ?, leader_mention = COALESCE(NULLIF(?, ''), leader_mention),
               strategy = COALESCE(NULLIF(?, ''), strategy),
               market_cap_tier = COALESCE(?, market_cap_tier),
               current_price_usd = COALESCE(?, current_price_usd),
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.companyName || String(existing.company_name),
          input.leaderMention ?? "",
          input.strategy ?? "",
          input.marketCapTier ?? null,
          input.currentPriceUsd ?? null,
          now,
          Number(existing.id)
        );
      return { opportunity: this.getOpportunity(Number(existing.id))!, created: false };
    }

    const res = this.db
      .prepare(
        `INSERT INTO opportunities (
          ticker, company_name, leader_mention, strategy, market_cap_tier, current_price_usd,
          planned_order_type, trigger_price_usd, target_capital_usd, planned_shares,
          action_type, action_due_date, action_status, snoozed_until, thesis_notes, source,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        normTicker,
        input.companyName || normTicker,
        input.leaderMention ?? "",
        input.strategy ?? "",
        input.marketCapTier ?? null,
        input.currentPriceUsd ?? null,
        input.plannedOrderType ?? "90D_TRIGGER",
        triggerPrice,
        targetCapital,
        plannedShares,
        input.actionType ?? "WATCH",
        input.actionDueDate ?? null,
        input.actionStatus ?? "PENDING",
        input.snoozedUntil ?? null,
        input.thesisNotes ?? "",
        input.source ?? "MANUAL",
        now,
        now
      );

    return { opportunity: this.getOpportunity(Number(res.lastInsertRowid))!, created: true };
  }

  updateOpportunity(id: number, patch: UpdateOpportunityInput): Opportunity | null {
    const current = this.getOpportunity(id);
    if (!current) return null;

    const triggerPrice = patch.triggerPriceUsd !== undefined ? patch.triggerPriceUsd : current.triggerPriceUsd;
    const targetCapital = patch.targetCapitalUsd !== undefined ? patch.targetCapitalUsd : current.targetCapitalUsd;
    const plannedShares =
      patch.plannedShares !== undefined
        ? patch.plannedShares
        : triggerPrice && triggerPrice > 0 && targetCapital && targetCapital > 0
          ? Number((targetCapital / triggerPrice).toFixed(6))
          : current.plannedShares;

    const next = {
      companyName: patch.companyName ?? current.companyName,
      leaderMention: patch.leaderMention ?? current.leaderMention,
      strategy: patch.strategy !== undefined ? patch.strategy : current.strategy,
      marketCapTier: patch.marketCapTier !== undefined ? patch.marketCapTier : current.marketCapTier,
      currentPriceUsd: patch.currentPriceUsd !== undefined ? patch.currentPriceUsd : current.currentPriceUsd,
      plannedOrderType: patch.plannedOrderType ?? current.plannedOrderType,
      triggerPriceUsd: triggerPrice,
      targetCapitalUsd: targetCapital,
      plannedShares,
      actionType: patch.actionType ?? current.actionType,
      actionDueDate: patch.actionDueDate !== undefined ? patch.actionDueDate : current.actionDueDate,
      actionStatus: patch.actionStatus ?? current.actionStatus,
      snoozedUntil: patch.snoozedUntil !== undefined ? patch.snoozedUntil : current.snoozedUntil,
      thesisNotes: patch.thesisNotes ?? current.thesisNotes,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `UPDATE opportunities
         SET company_name = ?, leader_mention = ?, strategy = ?, market_cap_tier = ?, current_price_usd = ?,
             planned_order_type = ?, trigger_price_usd = ?, target_capital_usd = ?, planned_shares = ?,
             action_type = ?, action_due_date = ?, action_status = ?, snoozed_until = ?,
             thesis_notes = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.companyName,
        next.leaderMention,
        next.strategy,
        next.marketCapTier,
        next.currentPriceUsd,
        next.plannedOrderType,
        next.triggerPriceUsd,
        next.targetCapitalUsd,
        next.plannedShares,
        next.actionType,
        next.actionDueDate,
        next.actionStatus,
        next.snoozedUntil,
        next.thesisNotes,
        next.updatedAt,
        id
      );

    return this.getOpportunity(id);
  }

  deleteOpportunity(id: number): void {
    this.db.prepare("DELETE FROM opportunities WHERE id = ?").run(id);
  }

  private mapBrokerOrder(r: Record<string, unknown>): BrokerOrder {
    return {
      id: Number(r.id),
      externalId: String(r.external_id),
      ticker: String(r.ticker),
      companyName: String(r.company_name ?? ""),
      side: String(r.side) === "SELL" ? "SELL" : "BUY",
      orderType: String(r.order_type ?? ""),
      status: String(r.status || "UNKNOWN") as BrokerOrderStatus,
      cancellationReason: String(r.cancellation_reason ?? ""),
      shares: Number(r.shares ?? 0),
      priceUsd: Number(r.price_usd ?? 0),
      valueUsd: Number(r.value_usd ?? 0),
      orderDate: String(r.order_date),
      expiryDate: (r.expiry_date as string | null) ?? null,
      decisionStatus: String(r.decision_status || "PENDING_REVIEW") as BrokerOrderDecisionStatus,
      strategy: String(r.strategy ?? ""),
      snoozedUntil: (r.snoozed_until as string | null) ?? null,
      notes: String(r.notes ?? ""),
      rawJson: String(r.raw_json ?? ""),
    };
  }

  listBrokerOrders(): BrokerOrder[] {
    const rows = this.db
      .prepare("SELECT * FROM broker_orders ORDER BY order_date DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapBrokerOrder(r));
  }

  upsertBrokerOrder(input: CreateBrokerOrderInput): { order: BrokerOrder; created: boolean } {
    const existing = this.db
      .prepare("SELECT * FROM broker_orders WHERE external_id = ?")
      .get(input.externalId) as Record<string, unknown> | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE broker_orders
           SET status = ?, cancellation_reason = CASE WHEN ? != '' THEN ? ELSE cancellation_reason END,
               expiry_date = COALESCE(?, expiry_date),
               raw_json = CASE WHEN ? != '' THEN ? ELSE raw_json END
           WHERE id = ?`
        )
        .run(
          input.status,
          input.cancellationReason ?? "",
          input.cancellationReason ?? "",
          input.expiryDate ?? null,
          input.rawJson ?? "",
          input.rawJson ?? "",
          Number(existing.id)
        );
      const row = this.db
        .prepare("SELECT * FROM broker_orders WHERE id = ?")
        .get(Number(existing.id)) as Record<string, unknown>;
      return { order: this.mapBrokerOrder(row), created: false };
    }

    const res = this.db
      .prepare(
        `INSERT INTO broker_orders (
          external_id, ticker, company_name, side, order_type, status, cancellation_reason,
          shares, price_usd, value_usd, order_date, expiry_date, strategy, notes, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.externalId,
        input.ticker.trim().toUpperCase(),
        input.companyName ?? input.ticker,
        input.side,
        input.orderType,
        input.status,
        input.cancellationReason ?? "",
        input.shares,
        input.priceUsd,
        input.valueUsd,
        input.orderDate,
        input.expiryDate ?? null,
        input.strategy ?? "",
        input.notes ?? "",
        input.rawJson ?? ""
      );

    const row = this.db
      .prepare("SELECT * FROM broker_orders WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return { order: this.mapBrokerOrder(row), created: true };
  }

  updateBrokerOrderDecision(
    id: number,
    patch: { decisionStatus?: BrokerOrderDecisionStatus; strategy?: string; snoozedUntil?: string | null; notes?: string }
  ): BrokerOrder | null {
    const existing = this.db
      .prepare("SELECT * FROM broker_orders WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;

    this.db
      .prepare(
        `UPDATE broker_orders
         SET decision_status = ?, strategy = ?, snoozed_until = ?, notes = COALESCE(?, notes)
         WHERE id = ?`
      )
      .run(
        patch.decisionStatus ?? String(existing.decision_status || "PENDING_REVIEW"),
        patch.strategy !== undefined ? patch.strategy : String(existing.strategy ?? ""),
        patch.snoozedUntil !== undefined ? patch.snoozedUntil : (existing.snoozed_until as string | null) ?? null,
        patch.notes ?? null,
        id
      );

    const row = this.db.prepare("SELECT * FROM broker_orders WHERE id = ?").get(id) as Record<string, unknown>;
    return this.mapBrokerOrder(row);
  }

  getActionSnoozes(): Record<string, string> {
    const rows = this.db.prepare("SELECT action_key, snoozed_until FROM action_snoozes").all() as Array<{
      action_key: string;
      snoozed_until: string;
    }>;
    const out: Record<string, string> = {};
    for (const r of rows) {
      out[r.action_key] = r.snoozed_until;
    }
    return out;
  }

  setActionSnooze(actionKey: string, snoozedUntil: string | null): void {
    if (!snoozedUntil) {
      this.db.prepare("DELETE FROM action_snoozes WHERE action_key = ?").run(actionKey);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO action_snoozes (action_key, snoozed_until)
         VALUES (?, ?)
         ON CONFLICT(action_key) DO UPDATE SET snoozed_until = excluded.snoozed_until`
      )
      .run(actionKey, snoozedUntil);
  }

  resetAll(): void {
    this.db.exec(`
      DELETE FROM closed_trades;
      DELETE FROM open_lots;
      DELETE FROM inr_deposits;
      DELETE FROM cashflow_events;
      DELETE FROM wallet_transactions;
      DELETE FROM broker_orders;
      DELETE FROM action_snoozes;
      UPDATE account_settings
      SET last_synced_at = NULL, sync_source = NULL,
          broker_cash_usd = 0, broker_invested_usd = 0, broker_current_value_usd = 0,
          broker_pnl_usd = 0, broker_holdings_count = 0
      WHERE id = 1;
    `);
  }
}

let singletonRepo: SqliteJournalRepository | null = null;

export function getJournalRepository(): JournalRepository {
  if (!singletonRepo) {
    singletonRepo = new SqliteJournalRepository();
  }
  return singletonRepo;
}
