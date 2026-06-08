"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { Transaction } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}

export function MovementsModal({ open, onOpenChange, onChanged }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transactions?limit=200");
      const json = await res.json();
      setTransactions(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function handleRefresh() {
    load();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movimientos</DialogTitle>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-[300px]" />
        ) : (
          <TransactionTable transactions={transactions} onRefresh={handleRefresh} />
        )}
      </DialogContent>
    </Dialog>
  );
}
