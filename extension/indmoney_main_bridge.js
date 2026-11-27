/**
 * HIFY INDmoney MAIN-World Network Interceptor
 * Runs at document_start in MAIN world.
 * Captures JSON responses from INDmoney's internal fetch/XHR calls,
 * auto-paginates orders/summary and transactionsForWeb using captured auth headers,
 * and forwards all pages to indmoney_content.js via window.postMessage.
 */
(function () {
  "use strict";
  if (window.__hifyIndmoneyBridgeInstalled) return;
  window.__hifyIndmoneyBridgeInstalled = true;

  const CHANNEL = "HIFY_INDMONEY_CAPTURE";
  const MAX_ORDER_PAGES = 20;
  const MAX_WALLET_PAGES = 25;
  const paginatedKeys = new Set();

  function shouldInspectUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (/\.(js|css|png|jpg|svg|woff2?|ico)(\?|$)/i.test(url)) return false;
    if (/google-analytics|googletagmanager|segment|mixpanel|sentry|hotjar/i.test(url)) return false;
    return url.includes("indmoney.com") || url.startsWith("/");
  }

  function emitCapture(url, payload) {
    try {
      window.postMessage(
        {
          source: CHANNEL,
          pageUrl: window.location.href,
          apiUrl: url,
          capturedAt: new Date().toISOString(),
          payload,
        },
        window.location.origin
      );
    } catch (_) {}
  }

  function normalizeHeaders(headersInit) {
    const out = {};
    if (!headersInit) return out;
    if (typeof Headers !== "undefined" && headersInit instanceof Headers) {
      headersInit.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    }
    if (Array.isArray(headersInit)) {
      for (const pair of headersInit) {
        if (Array.isArray(pair) && pair.length >= 2) {
          out[pair[0]] = pair[1];
        }
      }
      return out;
    }
    if (typeof headersInit === "object") {
      for (const [k, v] of Object.entries(headersInit)) {
        if (v !== undefined && v !== null) out[k] = String(v);
      }
    }
    return out;
  }

  async function fetchJsonWithHeaders(url, reqMeta) {
    const opts = {
      method: "GET",
      headers: reqMeta?.headers || {},
      credentials: reqMeta?.credentials || "include",
    };
    const res = await origFetch.call(window, url, opts);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  async function autoPaginateOrders(firstUrl, firstPayload, reqMeta) {
    if (!firstUrl.includes("orders/summary")) return;
    let currentUrl = firstUrl;
    let currentPayload = firstPayload;

    for (let page = 2; page <= MAX_ORDER_PAGES; page++) {
      const nextUrl = currentPayload?.data?.paginate_url;
      if (!nextUrl || typeof nextUrl !== "string") break;
      if (paginatedKeys.has(nextUrl)) break;
      paginatedKeys.add(nextUrl);

      let nextJson = null;
      let resolvedUrl = nextUrl;
      try {
        nextJson = await fetchJsonWithHeaders(nextUrl, reqMeta);
      } catch (_) {
        if (nextUrl.includes("apixt-fz.indmoney.com")) {
          resolvedUrl = nextUrl.replace("apixt-fz.indmoney.com", "apixt-us.indmoney.com");
          try {
            nextJson = await fetchJsonWithHeaders(resolvedUrl, reqMeta);
          } catch (_) {
            break;
          }
        } else {
          break;
        }
      }

      if (!nextJson) break;
      emitCapture(resolvedUrl, nextJson);
      currentUrl = resolvedUrl;
      currentPayload = nextJson;
      const orders = currentPayload?.data?.orders;
      if (!Array.isArray(orders) || orders.length === 0) break;
    }
  }

  function countWalletItems(payload) {
    let count = 0;
    for (const block of payload?.monthly_trxn || []) {
      if (Array.isArray(block?.trxn_list)) count += block.trxn_list.length;
    }
    return count;
  }

  async function autoPaginateWallet(firstUrl, firstPayload, reqMeta) {
    if (!firstUrl.includes("transactionsForWeb")) return;
    let parsedUrl;
    try {
      parsedUrl = new URL(firstUrl, window.location.origin);
    } catch (_) {
      return;
    }

    const startPage = Number(parsedUrl.searchParams.get("page") || "1");
    if (startPage !== 1) return;

    const limit = Number(parsedUrl.searchParams.get("limit") || "20");
    if (countWalletItems(firstPayload) < limit) return;

    for (let page = 2; page <= MAX_WALLET_PAGES; page++) {
      parsedUrl.searchParams.set("page", String(page));
      const nextUrl = parsedUrl.toString();
      if (paginatedKeys.has(nextUrl)) break;
      paginatedKeys.add(nextUrl);

      let nextJson = null;
      try {
        nextJson = await fetchJsonWithHeaders(nextUrl, reqMeta);
      } catch (_) {
        break;
      }

      if (!nextJson) break;
      const itemCount = countWalletItems(nextJson);
      if (itemCount === 0) break;
      emitCapture(nextUrl, nextJson);
      if (itemCount < limit) break;
    }
  }

  function handleCapturedPayload(url, json, reqMeta) {
    emitCapture(url, json);
    if (url.includes("orders/summary")) {
      autoPaginateOrders(url, json, reqMeta).catch(() => {});
    } else if (url.includes("transactionsForWeb")) {
      autoPaginateWallet(url, json, reqMeta).catch(() => {});
    }
  }

  // Hook window.fetch
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const reqInit = args[1] || {};
    const reqObj = typeof args[0] === "object" && args[0] !== null ? args[0] : null;
    const reqUrl = typeof args[0] === "string" ? args[0] : reqObj?.url || "";
    const reqMeta = {
      headers: {
        ...normalizeHeaders(reqObj?.headers),
        ...normalizeHeaders(reqInit.headers),
      },
      credentials: reqInit.credentials || reqObj?.credentials || "include",
    };

    const response = await origFetch.apply(this, args);
    try {
      if (shouldInspectUrl(reqUrl)) {
        const ct = response.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const clone = response.clone();
          clone
            .json()
            .then((json) => handleCapturedPayload(reqUrl, json, reqMeta))
            .catch(() => {});
        }
      }
    } catch (_) {}
    return response;
  };

  // Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__hifyUrl = typeof url === "string" ? url : "";
    this.__hifyHeaders = {};
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    if (this.__hifyHeaders && header) {
      this.__hifyHeaders[header] = value;
    }
    return origSetRequestHeader.call(this, header, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (!shouldInspectUrl(this.__hifyUrl)) return;
        const ct = this.getResponseHeader("content-type") || "";
        if (ct.includes("application/json") && this.responseText) {
          const json = JSON.parse(this.responseText);
          handleCapturedPayload(this.__hifyUrl, json, {
            headers: this.__hifyHeaders || {},
            credentials: this.withCredentials ? "include" : "same-origin",
          });
        }
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
