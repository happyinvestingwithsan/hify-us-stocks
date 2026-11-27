import { NextResponse } from "next/server";
import { getJournalRepository } from "@/lib/sqlite-repository";
import {
  fetchYahooQuotesBatch,
  fetchYahooUsdInrRate,
} from "@/lib/yahoo-quotes";

export async function POST() {
  const repo = getJournalRepository();

  const activeLots = repo.listOpenLots().filter((lot) => lot.remainingShares > 0);
  const opportunities = repo.listOpportunities();

  const tickers = Array.from(
    new Set(
      [
        ...activeLots.map((lot) => lot.ticker.trim().toUpperCase()),
        ...opportunities.map((opp) => opp.ticker.trim().toUpperCase()),
      ].filter((t) => t.length > 0)
    )
  );

  const [batchResult, liveUsdInrRate] = await Promise.all([
    fetchYahooQuotesBatch(tickers),
    fetchYahooUsdInrRate(),
  ]);

  const quoteUpdatedAt = new Date().toISOString();
  const updatedTickers: string[] = [];
  let updatedRows = 0;

  for (const quote of batchResult.succeeded) {
    const rows = await repo.updateQuotesForTicker(quote.symbol, {
      currentPriceUsd: quote.currentPriceUsd,
      prevCloseUsd: quote.prevCloseUsd,
      todayChangePct: quote.todayChangePct,
      athPriceUsd: quote.athPriceUsd,
      quoteSource: "YAHOO",
      quoteUpdatedAt,
    });
    updatedTickers.push(quote.symbol);
    updatedRows += rows;
  }

  if (
    liveUsdInrRate !== null &&
    Number.isFinite(liveUsdInrRate) &&
    liveUsdInrRate > 0
  ) {
    repo.updateSettings({ liveUsdInrRate });
  }

  return NextResponse.json({
    ok: true,
    updatedTickers,
    failedTickers: batchResult.failed,
    updatedRows,
    liveUsdInrRate,
    quoteUpdatedAt,
  });
}
