"use client";

import { useFetch } from "@/hooks/use-fetch";
import { PortfolioSummaryCards } from "@/components/dashboard/portfolio-summary-cards";
import { AllocationChart } from "@/components/charts/allocation-chart";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Camera } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioSummary, Transaction } from "@/types";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const {
    data: summary,
    loading: summaryLoading,
    refetch: refetchSummary,
  } = useFetch<PortfolioSummary>("/api/portfolio/summary");
  const {
    data: transactions,
    loading: txLoading,
    refetch: refetchTx,
  } = useFetch<Transaction[]>("/api/transactions?limit=5");

  // Auto-snapshot: create one for this month if it doesn't exist
  const snapshotChecked = useRef(false);
  useEffect(() => {
    if (!snapshotChecked.current) {
      snapshotChecked.current = true;
      fetch("/api/portfolio/snapshot").catch(() => {});
    }
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);

  async function refreshPrices() {
    setRefreshing(true);
    try {
      await Promise.all([
        fetch("/api/prices/crypto", { method: "POST" }),
        fetch("/api/prices/stocks", { method: "POST" }),
      ]);
      await refetchSummary();
    } finally {
      setRefreshing(false);
    }
  }

  async function takeSnapshot() {
    setSnapshotting(true);
    try {
      await fetch("/api/portfolio/snapshot", { method: "POST" });
    } finally {
      setSnapshotting(false);
    }
  }

  function refetchAll() {
    refetchSummary();
    refetchTx();
  }

  if (summaryLoading) {
    return (
      <div className="space-y-6 pt-12 md:pt-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshPrices}
            disabled={refreshing}
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin mr-2" : "mr-2"}
            />
            {refreshing ? "Actualizando..." : "Actualizar Precios"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={takeSnapshot}
            disabled={snapshotting}
          >
            <Camera size={14} className="mr-2" />
            {snapshotting ? "Guardando..." : "Snapshot"}
          </Button>
        </div>
      </div>

      {summary && <PortfolioSummaryCards summary={summary} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {summary && (
          <AllocationChart allocationByType={summary.allocation_by_type} />
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Ultimas Transacciones</CardTitle>
            <Link href="/transactions">
              <Button variant="ghost" size="sm">
                Ver todas
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <Skeleton className="h-[200px]" />
            ) : (
              <TransactionTable
                transactions={transactions || []}
                onRefresh={refetchAll}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
