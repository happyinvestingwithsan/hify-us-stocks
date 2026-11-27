/**
 * HIFY INDmoney Isolated Content Script
 * Listens for captured API payloads from indmoney_main_bridge.js
 * and forwards them to background.js for storage & journal sync.
 */
(function () {
  "use strict";

  const CHANNEL = "HIFY_INDMONEY_CAPTURE";

  function classifyEndpoint(apiUrl, pageUrl) {
    const combined = `${apiUrl} ${pageUrl}`.toLowerCase();
    if (combined.includes("order") || combined.includes("trade")) return "orders";
    if (combined.includes("wallet") || combined.includes("ledger") || combined.includes("remit") || combined.includes("deposit") || combined.includes("transactionsforweb") || combined.includes("fund-transfer")) {
      return "wallet";
    }
    if (combined.includes("holding") || combined.includes("my-us-stocks") || combined.includes("portfolio")) {
      return "holdings";
    }
    return "other";
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== CHANNEL || !msg.payload) return;

    const category = classifyEndpoint(msg.apiUrl || "", msg.pageUrl || "");
    try {
      chrome.runtime.sendMessage({
        action: "INDMONEY_API_CAPTURED",
        category,
        apiUrl: msg.apiUrl,
        pageUrl: msg.pageUrl,
        capturedAt: msg.capturedAt,
        payload: msg.payload,
      });
    } catch (_) {}
  });
})();
