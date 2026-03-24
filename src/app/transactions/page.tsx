"use client";

import { useFetch } from "@/hooks/use-fetch";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TRANSACTION_TYPES } from "@/lib/constants";
import type { Transaction, Asset } from "@/types";
import { useState, useCallback, useEffect } from "react";

export default function TransactionsPage() {
  const { data: assets } = useFetch<Asset[]>("/api/assets");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    asset_id: "",
    type: "",
    from: "",
    to: "",
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.asset_id) params.set("asset_id", filters.asset_id);
    if (filters.type) params.set("type", filters.type);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("limit", "100");

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const json = await res.json();
      setTransactions(json.data || []);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Transacciones</h1>
        <TransactionForm assets={assets || []} onSaved={fetchTransactions} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.asset_id}
          onValueChange={(v) =>
            setFilters({ ...filters, asset_id: v === "all" || !v ? "" : v })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los activos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los activos</SelectItem>
            {(assets || []).map((a) => (
              <SelectItem key={a.id} value={a.id.toString()}>
                {a.symbol} - {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.type}
          onValueChange={(v) =>
            setFilters({ ...filters, type: v === "all" || !v ? "" : v })
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TRANSACTION_TYPES).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="w-[160px]"
          placeholder="Desde"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="w-[160px]"
          placeholder="Hasta"
        />
      </div>

      {loading ? (
        <Skeleton className="h-[400px] rounded-lg" />
      ) : (
        <TransactionTable
          transactions={transactions}
          onRefresh={fetchTransactions}
        />
      )}
    </div>
  );
}
