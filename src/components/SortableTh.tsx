"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export type ColumnFilters<K extends string> = Partial<Record<K, string>>;

export function toggleSort<K extends string>(
  prev: SortState<K>,
  key: K,
  defaultDir: SortDir = "desc"
): SortState<K> {
  if (prev.key === key) {
    return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: defaultDir };
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessor: (row: T, key: K) => string | number | null | undefined
): T[] {
  const mult = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = accessor(a, sort.key);
    const vb = accessor(b, sort.key);
    if (va === null || va === undefined || va === "") return 1;
    if (vb === null || vb === undefined || vb === "") return -1;
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * mult;
    }
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * mult;
  });
}

export function filterRows<T, K extends string>(
  rows: T[],
  filters: ColumnFilters<K>,
  accessor: (row: T, key: K) => string | number | null | undefined
): T[] {
  const entries = Object.entries(filters).filter(
    ([, v]) => typeof v === "string" && v.trim() !== ""
  ) as Array<[K, string]>;
  if (entries.length === 0) return rows;

  return rows.filter((row) =>
    entries.every(([key, rawQuery]) => {
      const q = rawQuery.trim();
      const val = accessor(row, key);
      if (val === null || val === undefined) return false;

      // Support numeric comparisons like >100, <=50, >=0
      const cmp = q.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
      if (cmp && typeof val === "number" && Number.isFinite(val)) {
        const num = Number(cmp[2]);
        switch (cmp[1]) {
          case ">":
            return val > num;
          case "<":
            return val < num;
          case ">=":
            return val >= num;
          case "<=":
            return val <= num;
          case "=":
            return val === num;
        }
      }

      return String(val).toLowerCase().includes(q.toLowerCase());
    })
  );
}

export function filterAndSortRows<T, K extends string>(
  rows: T[],
  filters: ColumnFilters<K>,
  sort: SortState<K>,
  accessor: (row: T, key: K) => string | number | null | undefined
): T[] {
  return sortRows(filterRows(rows, filters, accessor), sort, accessor);
}

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  filterValue,
  onFilterChange,
  filterOptions,
  filterPlaceholder = "Filter...",
  sortable = true,
  alignRight = false,
  className = "px-3 py-2.5 whitespace-nowrap align-top",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  filterValue?: string;
  onFilterChange?: (val: string) => void;
  filterOptions?: string[];
  filterPlaceholder?: string;
  sortable?: boolean;
  alignRight?: boolean;
  className?: string;
}) {
  const active = sortable && sort.key === sortKey;
  const hasFilter = Boolean(filterValue && filterValue.trim() !== "");

  return (
    <th className={className}>
      <div className={`flex flex-col gap-1 ${alignRight ? "items-end" : "items-start"}`}>
        {sortable ? (
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider transition hover:text-[var(--primary-deep)] dark:hover:text-[var(--primary)] ${
              active ? "text-[var(--primary-deep)] dark:text-[var(--primary)]" : "text-[var(--text-main)]"
            }`}
          >
            <span>{label}</span>
            {active ? (
              sort.dir === "asc" ? (
                <ArrowUp className="h-3.5 w-3.5 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-[var(--primary-deep)] dark:text-[var(--primary)]" />
              )
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-45" />
            )}
          </button>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-main)]">
            {label}
          </span>
        )}

        {onFilterChange && (
          <div className="relative flex w-full min-w-[72px] items-center">
            {filterOptions ? (
              <select
                value={filterValue ?? ""}
                onChange={(e) => onFilterChange(e.target.value)}
                aria-label={`Filter ${label}`}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-normal normal-case text-[var(--text-main)] focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">All</option>
                {filterOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={filterValue ?? ""}
                  onChange={(e) => onFilterChange(e.target.value)}
                  placeholder={filterPlaceholder}
                  aria-label={`Filter ${label}`}
                  className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 pr-4 text-[10px] font-normal normal-case text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 focus:border-[var(--primary)] focus:outline-none"
                />
                {hasFilter && (
                  <button
                    type="button"
                    onClick={() => onFilterChange("")}
                    title={`Clear ${label} filter`}
                    className="absolute right-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </th>
  );
}
