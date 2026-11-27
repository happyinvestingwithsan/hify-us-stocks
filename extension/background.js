/**
 * HIFY US Stocks — INDmoney Sync Background Service Worker (Manifest V3)
 * Message contract matches dev1/tools/tradingview/extension/background.js
 */
importScripts("config.js");

const STORAGE_KEY = "hify_indmoney_capture";
const MAX_ENTRIES_PER_BUCKET = 50;

async function getCaptureState() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return (
    data[STORAGE_KEY] || {
      orders: [],
      holdings: [],
      wallet: [],
      other: [],
      lastCapturedAt: null,
      lastSyncedAt: null,
    }
  );
}

async function saveCapture(msg) {
  const state = await getCaptureState();
  const cat = ["orders", "holdings", "wallet"].includes(msg.category) ? msg.category : "other";
  const bucket = Array.isArray(state[cat]) ? state[cat] : [];

  const entry = {
    apiUrl: msg.apiUrl,
    pageUrl: msg.pageUrl,
    capturedAt: msg.capturedAt,
    payload: msg.payload,
  };

  // Replace existing entry for same apiUrl or prepend (keep max MAX_ENTRIES_PER_BUCKET per bucket)
  const filtered = bucket.filter((item) => item.apiUrl !== msg.apiUrl);
  filtered.unshift(entry);
  state[cat] = filtered.slice(0, MAX_ENTRIES_PER_BUCKET);
  state.lastCapturedAt = msg.capturedAt || new Date().toISOString();

  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return state;
}

async function syncNowToJournal() {
  const state = await getCaptureState();
  const totalCaptured =
    (state.orders?.length || 0) +
    (state.holdings?.length || 0) +
    (state.wallet?.length || 0) +
    (state.other?.length || 0);

  if (totalCaptured === 0) {
    return {
      ok: false,
      error: "No INDmoney data captured yet. Open Orders / Holdings / Wallet History and refresh once.",
    };
  }

  const baseUrl = (typeof US_JOURNAL_API_URL !== "undefined" ? US_JOURNAL_API_URL : "http://localhost:3010").replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/api/sync/indmoney`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "INDMONEY_CHROME_EXTENSION",
      rawCaptures: {
        orders: state.orders,
        holdings: state.holdings,
        wallet: state.wallet,
        other: state.other,
      },
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    return { ok: false, error: json.error || `HTTP ${res.status}` };
  }

  state.lastSyncedAt = new Date().toISOString();
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return { ok: true, result: json.result, lastSyncedAt: state.lastSyncedAt };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.action) return false;

  if (message.action === "INDMONEY_API_CAPTURED") {
    saveCapture(message)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === "GET_INDMONEY_STATUS") {
    getCaptureState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === "SYNC_INDMONEY_NOW") {
    syncNowToJournal()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === "CLEAR_INDMONEY_CAPTURE") {
    chrome.storage.local
      .remove([STORAGE_KEY])
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});
