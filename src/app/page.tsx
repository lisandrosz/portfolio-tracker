"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PortfolioHeader } from "@/components/home/portfolio-header";
import { HistoryChart } from "@/components/home/history-chart";
import { AllocationDonut } from "@/components/home/allocation-donut";
import { HoldingsPanel } from "@/components/home/holdings-panel";
import { MovementsModal } from "@/components/home/movements-modal";
import { SettingsModal } from "@/components/home/settings-modal";
import type { PortfolioSummary } from "@/types";

export default function HomePage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [chartKey, setChartKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const tickRef = useRef(0);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/api/portfolio/summary");
    const json = await res.json();
    if (json.data) {
      setSummary(json.data);
      setLastUpdated(Date.now());
    }
  }, []);

  // Refresh live prices (crypto + bingx every tick; fci occasionally).
  const refreshPrices = useCallback(async (includeFci = false) => {
    const calls = [
      fetch("/api/prices/crypto", { method: "POST" }),
      fetch("/api/prices/bingx", { method: "POST" }),
    ];
    if (includeFci) calls.push(fetch("/api/prices/fci", { method: "POST" }));
    await Promise.allSettled(calls);
    await loadSummary();
    setChartKey((k) => k + 1);
  }, [loadSummary]);

  // After data changes (add/edit/delete): rebuild history, then reload.
  const onDataChanged = useCallback(async () => {
    await loadSummary();
    setChartKey((k) => k + 1);
    // Rebuild historical curve in the background.
    fetch("/api/portfolio/rebuild", { method: "POST" })
      .then(() => {
        loadSummary();
        setChartKey((k) => k + 1);
      })
      .catch(() => {});
  }, [loadSummary]);

  // Initial load + 30s poller (paused when tab hidden).
  useEffect(() => {
    refreshPrices(true);

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      tickRef.current += 1;
      const includeFci = tickRef.current % 20 === 0; // ~every 10 min
      refreshPrices(includeFci);
    }, 30_000);

    function onVisible() {
      if (!document.hidden) refreshPrices();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPrices]);

  return (
    <>
      <div className="space-y-6">
        <PortfolioHeader
          summary={summary}
          lastUpdated={lastUpdated}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <HistoryChart refreshKey={chartKey} />
          <AllocationDonut
            assets={summary?.assets || []}
            totalValue={summary?.total_value || 0}
          />
        </div>

        <HoldingsPanel
          assets={summary?.assets || []}
          onRefresh={onDataChanged}
          onOpenMovements={() => setMovementsOpen(true)}
        />
      </div>

      <MovementsModal
        open={movementsOpen}
        onOpenChange={setMovementsOpen}
        onChanged={onDataChanged}
      />
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={onDataChanged}
      />
    </>
  );
}
