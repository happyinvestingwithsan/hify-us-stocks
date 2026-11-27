/**
 * HIFY Nexus Chrome Extension — INDmoney US Stocks Collector (Phase 1)
 *
 * Target integration: D:\AI Projects\hify-nexus\dev1\tools\tradingview\extension\
 * Manifest match: "https://*.indmoney.com/*"
 *
 * Reads US Stocks tradebook / order history from the user's authenticated
 * indmoney.com browser session and posts normalized executions to /api/sync/indmoney.
 */
(function () {
  "use strict";

  const JOURNAL_API = "http://localhost:3010/api/sync/indmoney";

  function injectSyncBadge() {
    if (document.getElementById("hify-indmoney-sync-btn")) return;
    const btn = document.createElement("button");
    btn.id = "hify-indmoney-sync-btn";
    btn.textContent = "Sync US Trades to HIFY Journal";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "99999",
      background: "#f59e0b",
      color: "#0f172a",
      fontWeight: "700",
      fontSize: "12px",
      padding: "10px 14px",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    });

    btn.addEventListener("click", async () => {
      btn.textContent = "Syncing...";
      try {
        const executions = scrapeVisibleUsOrders();
        const res = await fetch(JOURNAL_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executions,
            source: "INDMONEY_CHROME_EXTENSION",
          }),
        });
        const data = await res.json();
        btn.textContent = data.ok
          ? `Synced (${data.result.buysCreated} buys, ${data.result.sellsMatched} sells)`
          : "Sync Failed";
      } catch (err) {
        console.error("[HIFY INDmoney Sync]", err);
        btn.textContent = "Journal Offline (Start :3010)";
      }
      setTimeout(() => {
        btn.textContent = "Sync US Trades to HIFY Journal";
      }, 4000);
    });

    document.body.appendChild(btn);
  }

  /**
   * Parses visible US order/trade rows from the INDmoney web table.
   * Selector fallbacks will be refined against live DOM on indmoney.com.
   */
  function scrapeVisibleUsOrders() {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    const executions = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map((td) => td.innerText.trim());
      if (cells.length < 4) continue;
      const tickerMatch = cells.join(" ").match(/\b([A-Z]{1,5})\b/);
      if (!tickerMatch) continue;
      // Placeholder normalization; live INDmoney API/DOM mapping refined during live session check
      const rawText = cells.join("|");
      const side = /\bsell\b/i.test(rawText) ? "SELL" : /\bbuy\b/i.test(rawText) ? "BUY" : null;
      if (!side) continue;
      const numbers = rawText.match(/\d+(\.\d+)?/g) || [];
      if (numbers.length < 2) continue;
      executions.push({
        externalId: `ind:dom:${btoa(rawText).slice(0, 24)}`,
        side,
        ticker: tickerMatch[1],
        tradeDate: new Date().toISOString().slice(0, 10),
        shares: Number(numbers[0]),
        priceUsd: Number(numbers[1]),
      });
    }
    return executions;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectSyncBadge);
  } else {
    injectSyncBadge();
  }
})();
