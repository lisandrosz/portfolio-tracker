"use client";

import { useState, useEffect, useCallback } from "react";
import { PortfolioEvolution } from "@/components/charts/portfolio-evolution";
import { GainsLossesChart } from "@/components/charts/gains-losses-chart";
import { AllocationChart } from "@/components/charts/allocation-chart";
import { useFetch } from "@/hooks/use-fetch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortfolioSnapshot, PortfolioSummary } from "@/types";
import type { Period } from "@/lib/constants";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("ALL");
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);

  const { data: summary } = useFetch<PortfolioSummary>(
    "/api/portfolio/summary"
  );

  const fetchSnapshots = useCallback(async () => {
    setLoadingSnapshots(true);
    try {
      const res = await fetch(`/api/portfolio/history?period=${period}`);
      const json = await res.json();
      setSnapshots(json.data || []);
    } finally {
      setLoadingSnapshots(false);
    }
  }, [period]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  return (
    <div className="space-y-6 pt-12 md:pt-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Analytics</h1>

        <Tabs
          value={period}
          onValueChange={(v) => v && setPeriod(v as Period)}
        >
          <TabsList>
            <TabsTrigger value="1M">1M</TabsTrigger>
            <TabsTrigger value="3M">3M</TabsTrigger>
            <TabsTrigger value="6M">6M</TabsTrigger>
            <TabsTrigger value="1Y">1Y</TabsTrigger>
            <TabsTrigger value="ALL">Todo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loadingSnapshots ? (
        <Skeleton className="h-[400px] rounded-lg" />
      ) : (
        <div className="space-y-6">
          <PortfolioEvolution snapshots={snapshots} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GainsLossesChart snapshots={snapshots} />
            {summary && (
              <AllocationChart
                allocationByType={summary.allocation_by_type}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
