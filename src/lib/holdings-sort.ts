import { isCashType, isDebtType } from "./constants";
import type { AssetWithValue } from "@/types";

/**
 * Ordering for the holdings table: which column ranks the rows, and how a group
 * of strategies takes its place among them.
 *
 * Pure on purpose — the panel renders it, and it can be exercised without one.
 */
export function groupTotals(list: AssetWithValue[]) {
  const value = list.reduce((s, a) => s + a.equity, 0);
  const perf = list.filter((a) => !isCashType(a.type) && !isDebtType(a.type));
  const gain = perf.reduce((s, a) => s + a.profit_loss, 0);
  const gross = perf.reduce((s, a) => s + a.gross_invested, 0);
  return { value, gain, gross, pct: gross > 0 ? (gain / gross) * 100 : 0, hasPerf: perf.length > 0 };
}

export type SortKey = "symbol" | "equity" | "profit_loss";
export type SortDir = 1 | -1;

export const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: "symbol", label: "Activo" },
  { key: "equity", label: "Valor", right: true },
  { key: "profit_loss", label: "Ganancia", right: true },
];

// Value shown by default, biggest first — what the table did before it could be
// sorted at all.
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "equity", dir: -1 };
export const SORT_STORAGE_KEY = "holdings-sort";

/** Sort by what the cell actually shows, so the order matches the column. */
export function assetSortValue(a: AssetWithValue, key: SortKey): number | string {
  return key === "symbol" ? a.symbol.toLowerCase() : a[key];
}

export function compareValues(x: number | string, y: number | string, dir: SortDir) {
  if (typeof x === "string" || typeof y === "string") {
    return String(x).localeCompare(String(y), "es") * dir;
  }
  return (x - y) * dir;
}

export type Row =
  | { kind: "group"; name: string; list: AssetWithValue[] }
  | { kind: "asset"; asset: AssetWithValue };

/** A group heading sorts by what it displays: its name, or its subtotal. */
export function rowSortValue(row: Row, key: SortKey): number | string {
  if (row.kind === "asset") return assetSortValue(row.asset, key);
  if (key === "symbol") return row.name.toLowerCase();
  const t = groupTotals(row.list);
  return key === "profit_loss" ? t.gain : t.value;
}

/**
 * Order the rows so grouped assets sit together under their heading, and work
 * out which groups are real (a lone member is just a row, not a group).
 *
 * Groups take their place in the same ordering as everything else rather than
 * being pinned above it: a group worth less than a standalone holding should
 * sort below it, or the column you clicked isn't really the order.
 */
export function buildRows(shown: AssetWithValue[], key: SortKey, dir: SortDir): Row[] {
  const members = new Map<string, AssetWithValue[]>();
  for (const a of shown) {
    if (!a.group_name) continue;
    if (!members.has(a.group_name)) members.set(a.group_name, []);
    members.get(a.group_name)!.push(a);
  }
  // One asset carrying a label isn't worth a heading and a subtotal of itself.
  for (const [name, list] of members) if (list.length < 2) members.delete(name);

  const rows: Row[] = [
    ...[...members.entries()].map(([name, list]) => ({
      kind: "group" as const,
      name,
      list: [...list].sort((x, y) =>
        compareValues(assetSortValue(x, key), assetSortValue(y, key), dir)
      ),
    })),
    ...shown
      .filter((a) => !a.group_name || !members.has(a.group_name))
      .map((asset) => ({ kind: "asset" as const, asset })),
  ];

  return rows.sort((x, y) =>
    compareValues(rowSortValue(x, key), rowSortValue(y, key), dir)
  );
}
