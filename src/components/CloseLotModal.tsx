"use client";

import { useState } from "react";
import { ExecutionType, OpenLot } from "@/lib/types";

interface CloseLotModalProps {
  lot: OpenLot;
  onClose: () => void;
  onSubmitted: () => void;
}

export function CloseLotModal({ lot, onClose, onSubmitted }: CloseLotModalProps) {
  const [sharesToClose, setSharesToClose] = useState(String(lot.remainingShares));
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10));
  const [sellPriceUsd, setSellPriceUsd] = useState(
    String(lot.currentPriceUsd ?? lot.targetPriceUsd ?? lot.buyPriceUsd)
  );
  const [sellFeesUsd, setSellFeesUsd] = useState("0");
  const [executionType, setExecutionType] = useState<ExecutionType>("INSTANT");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/trades/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openLotId: lot.id,
          sharesToClose: Number(sharesToClose),
          sellDate,
          sellPriceUsd: Number(sellPriceUsd),
          sellFeesUsd: Number(sellFeesUsd),
          executionType,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to close lot");
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error closing lot");
    } finally {
      setSaving(false);
    }
  }

  const modalInput =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--section-bg)] px-2.5 py-2 text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-[var(--text-main)]">
          Close Lot — {lot.ticker} ({lot.buyDate})
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Remaining: {lot.remainingShares} shares @ ${lot.buyPriceUsd.toFixed(2)}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-[var(--text-muted)]">Shares to Close</span>
              <input
                type="number"
                step="any"
                max={lot.remainingShares}
                min="0.000001"
                required
                value={sharesToClose}
                onChange={(e) => setSharesToClose(e.target.value)}
                className={modalInput}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--text-muted)]">Sell Date</span>
              <input
                type="date"
                required
                value={sellDate}
                onChange={(e) => setSellDate(e.target.value)}
                className={modalInput}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-[var(--text-muted)]">Sell Price ($)</span>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={sellPriceUsd}
                onChange={(e) => setSellPriceUsd(e.target.value)}
                className={modalInput}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--text-muted)]">Sell Fees ($)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={sellFeesUsd}
                onChange={(e) => setSellFeesUsd(e.target.value)}
                className={modalInput}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-[var(--text-muted)]">Execution Type</span>
            <select
              value={executionType}
              onChange={(e) => setExecutionType(e.target.value as ExecutionType)}
              className={modalInput}
            >
              <option value="INSTANT">Instant / Market / Limit</option>
              <option value="GTT">Sell GTT Triggered</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-[var(--text-muted)]">Exit Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Target hit, partial profit booked"
              className={modalInput}
            />
          </label>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary min-h-[44px] rounded-lg px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {saving ? "Closing..." : "Confirm Close"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
