"use client";

import { useFetch } from "@/hooks/use-fetch";
import { AssetTable } from "@/components/assets/asset-table";
import { AssetForm } from "@/components/assets/asset-form";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioSummary } from "@/types";
import { useState } from "react";

export default function AssetsPage() {
  const {
    data: summary,
    loading,
    refetch,
  } = useFetch<PortfolioSummary>("/api/portfolio/summary");
  const [refreshing, setRefreshing] = useState(false);

  async function refreshPrices() {
    setRefreshing(true);
    try {
      await Promise.all([
        fetch("/api/prices/crypto", { method: "POST" }),
        fetch("/api/prices/stocks", { method: "POST" }),
      ]);
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Activos</h1>
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
            Actualizar Precios
          </Button>
          <AssetForm onSaved={refetch} />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[400px] rounded-lg" />
      ) : (
        <AssetTable assets={summary?.assets || []} onRefresh={refetch} />
      )}
    </div>
  );
}
