"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { ASSET_TYPES } from "@/lib/constants";
import {
  centsToUsd,
  formatPercent,
  formatQuantity,
} from "@/lib/formatters";
import { AssetForm } from "./asset-form";
import type { AssetWithValue } from "@/types";
import type { AssetType } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AssetTableProps {
  assets: AssetWithValue[];
  onRefresh: () => void;
}

export function AssetTable({ assets, onRefresh }: AssetTableProps) {
  async function handleDelete(id: number) {
    if (!confirm("Eliminar este activo y todas sus transacciones?")) return;
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Activo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No hay activos. Agrega tu primer activo.
              </TableCell>
            </TableRow>
          ) : (
            assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <div>
                    <span className="font-medium">{asset.symbol}</span>
                    <span className="text-muted-foreground ml-2 text-sm">
                      {asset.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {ASSET_TYPES[asset.type as AssetType] || asset.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatQuantity(asset.quantity)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {centsToUsd(asset.current_price)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {centsToUsd(asset.current_value)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    asset.profit_loss >= 0 ? "text-emerald-500" : "text-red-500"
                  )}
                >
                  {centsToUsd(asset.profit_loss)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    asset.profit_loss_pct >= 0
                      ? "text-emerald-500"
                      : "text-red-500"
                  )}
                >
                  {formatPercent(asset.profit_loss_pct)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <AssetForm asset={asset} onSaved={onRefresh} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(asset.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
