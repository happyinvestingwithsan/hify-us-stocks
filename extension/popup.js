function refreshStatus() {
  chrome.runtime.sendMessage({ action: "GET_INDMONEY_STATUS" }, (res) => {
    if (!res?.ok || !res.state) return;
    const s = res.state;
    document.getElementById("cnt_orders").textContent = String(s.orders?.length || 0);
    document.getElementById("cnt_holdings").textContent = String(s.holdings?.length || 0);
    document.getElementById("cnt_wallet").textContent = String(s.wallet?.length || 0);
    document.getElementById("cnt_other").textContent = String(s.other?.length || 0);

    const statusEl = document.getElementById("status_msg");
    if (s.lastSyncedAt) {
      statusEl.textContent = `Last synced: ${new Date(s.lastSyncedAt).toLocaleTimeString()}`;
    } else if (s.lastCapturedAt) {
      statusEl.textContent = `Data captured at ${new Date(s.lastCapturedAt).toLocaleTimeString()}. Ready to sync.`;
    }
  });
}

document.getElementById("sync_btn").addEventListener("click", () => {
  const btn = document.getElementById("sync_btn");
  const statusEl = document.getElementById("status_msg");
  btn.disabled = true;
  btn.textContent = "Syncing...";

  chrome.runtime.sendMessage({ action: "SYNC_INDMONEY_NOW" }, (res) => {
    btn.disabled = false;
    btn.textContent = "⚡ Sync Now to localhost:3010";
    if (res?.ok) {
      statusEl.textContent = `Synced! Buys: ${res.result.buysCreated}, Sells: ${res.result.sellsMatched}, Cashflows: ${res.result.cashflowsCreated}`;
      refreshStatus();
    } else {
      statusEl.textContent = `Error: ${res?.error || "Sync failed"}`;
    }
  });
});

document.getElementById("open_orders").addEventListener("click", () => {
  chrome.tabs.create({ url: INDMONEY_US_URLS.orders });
});
document.getElementById("open_holdings").addEventListener("click", () => {
  chrome.tabs.create({ url: INDMONEY_US_URLS.holdings });
});
document.getElementById("open_wallet").addEventListener("click", () => {
  chrome.tabs.create({ url: INDMONEY_US_URLS.wallet });
});

refreshStatus();
