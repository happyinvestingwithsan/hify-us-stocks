"use client";

import React, { useMemo, useState } from "react";
import { Check, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Strategy } from "@/lib/types";
import {
  ColumnFilters,
  SortableTh,
  SortState,
  filterAndSortRows,
  toggleSort,
} from "./SortableTh";

interface AdminStrategiesTabProps {
  strategies: Strategy[];
  onRefresh: () => Promise<void> | void;
}

type StrategySortKey = "name" | "description" | "status" | "updatedAt";

export function AdminStrategiesTab({ strategies, onRefresh }: AdminStrategiesTabProps) {
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [sort, setSort] = useState<SortState<StrategySortKey>>({ key: "name", dir: "asc" });
  const [filters, setFilters] = useState<ColumnFilters<StrategySortKey>>({});

  const visibleStrategies = useMemo(() => {
    return filterAndSortRows(strategies, filters, sort, (s, key) => {
      switch (key) {
        case "name":
          return s.name;
        case "description":
          return s.description;
        case "status":
          return s.isActive ? "Active" : "Paused";
        case "updatedAt":
          return s.updatedAt.slice(0, 10);
      }
    });
  }, [strategies, filters, sort]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const clean = newName.trim();
    if (!clean) {
      setErrorMsg("Strategy name is required.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean, description: newDesc.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(j.error ?? "Failed to add strategy");
        return;
      }
      setNewName("");
      setNewDesc("");
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!editName.trim()) {
      setErrorMsg("Strategy name cannot be empty.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        await onRefresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(s: Strategy) {
    setSaving(true);
    try {
      const res = await fetch(`/api/strategies/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      if (res.ok) await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: Strategy) {
    setSaving(true);
    try {
      const res = await fetch(`/api/strategies/${s.id}`, { method: "DELETE" });
      if (res.ok) await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  const hasActiveFilters = Object.values(filters).some((v) => v && v.trim() !== "");

  return (
    <div className="space-y-5">
      <div className="hify-card rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-main)]">
              <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
              Admin — Strategy Master List
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Manage your trading strategies here. Active strategies appear in the mandatory Strategy dropdown across Action for the Day, Opportunities, and Open Lots.
            </p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--section-bg)] px-3 py-1 text-xs font-medium text-[var(--text-main)]">
            {strategies.filter((s) => s.isActive).length} Active / {strategies.length} Total
          </span>
        </div>

        <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <input
            type="text"
            placeholder="Strategy Name (e.g. Cup & Handle, Earnings Gap)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none sm:col-span-4"
          />
          <input
            type="text"
            placeholder="Description / Entry & Exit Rules (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none sm:col-span-6"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50 sm:col-span-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Strategy
          </button>
        </form>

        {errorMsg && (
          <p className="mt-2 text-xs font-medium text-rose-500">{errorMsg}</p>
        )}
      </div>

      <div className="hify-card overflow-x-auto rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
          <span>
            Showing {visibleStrategies.length} of {strategies.length} strategies
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-xs font-medium text-[var(--primary-deep)] hover:underline dark:text-[var(--primary)]"
            >
              Clear Header Filters
            </button>
          )}
        </div>
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="border-b-2 border-[var(--border)] bg-[var(--section-bg)] text-[var(--text-main)]">
            <tr>
              <SortableTh
                label="Strategy Name"
                sortKey="name"
                sort={sort}
                onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                filterValue={filters.name ?? ""}
                onFilterChange={(v) => setFilters((f) => ({ ...f, name: v }))}
              />
              <SortableTh
                label="Description / Rules"
                sortKey="description"
                sort={sort}
                onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                filterValue={filters.description ?? ""}
                onFilterChange={(v) => setFilters((f) => ({ ...f, description: v }))}
              />
              <SortableTh
                label="Status"
                sortKey="status"
                sort={sort}
                onSort={(k) => setSort((p) => toggleSort(p, k, "asc"))}
                filterValue={filters.status ?? ""}
                onFilterChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                filterOptions={["Active", "Paused"]}
              />
              <SortableTh
                label="Updated"
                sortKey="updatedAt"
                sort={sort}
                onSort={(k) => setSort((p) => toggleSort(p, k))}
                filterValue={filters.updatedAt ?? ""}
                onFilterChange={(v) => setFilters((f) => ({ ...f, updatedAt: v }))}
              />
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)] align-top">
                Controls
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {visibleStrategies.map((s) => {
              const isEditing = editingId === s.id;
              return (
                <tr key={s.id} className="hover:bg-[var(--primary-soft)]/50">
                  <td className="px-3 py-2.5 font-semibold text-[var(--text-main)]">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border border-[var(--primary)] bg-transparent px-2 py-1 text-xs focus:outline-none"
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full rounded border border-[var(--primary)] bg-transparent px-2 py-1 text-xs focus:outline-none"
                      />
                    ) : (
                      s.description || "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleToggleActive(s)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        s.isActive
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-zinc-500/15 text-[var(--text-muted)]"
                      }`}
                    >
                      {s.isActive ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[var(--text-muted)]">
                    {s.updatedAt.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSaveEdit(s.id)}
                            className="rounded border border-emerald-500/40 bg-emerald-500/10 p-1 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                            title="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded border border-[var(--border)] p-1 text-[var(--text-muted)] hover:bg-[var(--section-bg)]"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(s.id);
                              setEditName(s.name);
                              setEditDesc(s.description);
                            }}
                            className="rounded border border-[var(--border)] p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                            title="Edit strategy"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleDelete(s)}
                            className="rounded border border-rose-500/30 p-1 text-rose-500 hover:bg-rose-500/10"
                            title="Delete strategy"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleStrategies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-muted)]">
                  {strategies.length === 0
                    ? "No strategies configured yet. Add a strategy above."
                    : "No strategies match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
