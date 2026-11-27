export interface YahooQuoteSuccess {
  symbol: string;
  currentPriceUsd: number;
  prevCloseUsd: number | null;
  todayChangePct: number | null;
  athPriceUsd: number | null;
}

export interface YahooQuoteFailure {
  symbol: string;
  error: string;
}

export interface YahooQuotesBatchResult {
  succeeded: YahooQuoteSuccess[];
  failed: YahooQuoteFailure[];
}

type YahooFetchOutcome =
  | { ok: true; data: YahooQuoteSuccess }
  | { ok: false; error: string };

const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooChartMeta {
  regularMarketPrice?: unknown;
  chartPreviousClose?: unknown;
  previousClose?: unknown;
  fiftyTwoWeekHigh?: unknown;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
    }> | null;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function fetchYahooQuoteInternal(symbol: string): Promise<YahooFetchOutcome> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol) {
    return { ok: false, error: "Empty symbol" };
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    cleanSymbol
  )}?interval=1d&range=5d`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": YAHOO_USER_AGENT,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
    }

    const payload = (await res.json()) as YahooChartResponse;
    const chartError = payload?.chart?.error;
    if (chartError) {
      return {
        ok: false,
        error: chartError.description || chartError.code || "Yahoo chart error",
      };
    }

    const meta = payload?.chart?.result?.[0]?.meta;
    if (!meta) {
      return { ok: false, error: "Missing chart.result[0].meta" };
    }

    const currentPriceUsd = isValidNumber(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : null;

    if (currentPriceUsd === null || currentPriceUsd <= 0) {
      return { ok: false, error: "Missing or invalid regularMarketPrice" };
    }

    const prevCloseUsd = isValidNumber(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : isValidNumber(meta.previousClose)
        ? meta.previousClose
        : null;

    const todayChangePct =
      currentPriceUsd > 0 && prevCloseUsd !== null && prevCloseUsd > 0
        ? Number((((currentPriceUsd - prevCloseUsd) / prevCloseUsd) * 100).toFixed(2))
        : null;

    const athPriceUsd = isValidNumber(meta.fiftyTwoWeekHigh)
      ? meta.fiftyTwoWeekHigh
      : null;

    return {
      ok: true,
      data: {
        symbol: cleanSymbol,
        currentPriceUsd,
        prevCloseUsd,
        todayChangePct,
        athPriceUsd,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function fetchYahooQuote(
  symbol: string
): Promise<YahooQuoteSuccess | null> {
  const outcome = await fetchYahooQuoteInternal(symbol);
  return outcome.ok ? outcome.data : null;
}

export async function fetchYahooQuotesBatch(
  symbols: string[],
  concurrency = 5
): Promise<YahooQuotesBatchResult> {
  const uniqueSymbols = Array.from(
    new Set(
      symbols
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0)
    )
  );

  const succeeded: YahooQuoteSuccess[] = [];
  const failed: YahooQuoteFailure[] = [];

  if (uniqueSymbols.length === 0) {
    return { succeeded, failed };
  }

  const workerCount = Math.max(1, Math.min(concurrency, uniqueSymbols.length));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < uniqueSymbols.length) {
      const idx = nextIndex++;
      const sym = uniqueSymbols[idx];
      const outcome = await fetchYahooQuoteInternal(sym);
      if (outcome.ok) {
        succeeded.push(outcome.data);
      } else {
        failed.push({ symbol: sym, error: outcome.error });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { succeeded, failed };
}

export async function fetchYahooUsdInrRate(): Promise<number | null> {
  const quote = await fetchYahooQuote("USDINR=X");
  if (!quote || !Number.isFinite(quote.currentPriceUsd) || quote.currentPriceUsd <= 0) {
    return null;
  }
  return quote.currentPriceUsd;
}
