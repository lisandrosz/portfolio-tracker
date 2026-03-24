"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_TYPES, POPULAR_CRYPTOS } from "@/lib/constants";
import { numberToCents } from "@/lib/formatters";
import { Plus, Pencil, Loader2 } from "lucide-react";
import type { Asset } from "@/types";

interface AssetFormProps {
  asset?: Asset;
  onSaved: () => void;
}

export function AssetForm({ asset, onSaved }: AssetFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: asset?.name || "",
    symbol: asset?.symbol || "",
    type: asset?.type || "crypto",
    coingecko_id: asset?.coingecko_id || "",
    quantity: asset?.quantity?.toString() || "0",
    current_price: asset ? (asset.current_price / 100).toString() : "0",
    date: asset?.created_at ? asset.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
    notes: asset?.notes || "",
  });

  const [fetchingPrice, setFetchingPrice] = useState(false);

  const isEdit = !!asset;

  const fetchHistoricalPrice = useCallback(
    async (coinId: string, date: string) => {
      if (!coinId || !date) return;
      setFetchingPrice(true);
      try {
        const res = await fetch(
          `/api/prices/history?coin_id=${coinId}&date=${date}`
        );
        const json = await res.json();
        if (json.data?.price) {
          setForm((prev) => ({
            ...prev,
            current_price: json.data.price.toString(),
          }));
        }
      } finally {
        setFetchingPrice(false);
      }
    },
    []
  );

  function handleDateChange(date: string) {
    setForm((prev) => ({ ...prev, date }));
    if (form.type === "crypto" && form.coingecko_id) {
      fetchHistoricalPrice(form.coingecko_id, date);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const body = {
      name: form.name,
      symbol: form.symbol,
      type: form.type,
      coingecko_id: form.type === "crypto" && form.coingecko_id ? form.coingecko_id : null,
      quantity: parseFloat(form.quantity) || 0,
      current_price: numberToCents(parseFloat(form.current_price) || 0),
      date: form.date,
      notes: form.notes || null,
    };

    const url = isEdit ? `/api/assets/${asset.id}` : "/api/assets";
    const method = isEdit ? "PUT" : "POST";

    try {
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setOpen(false);
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  function handleSymbolChange(val: string) {
    const upper = val.toUpperCase();
    setForm((prev) => ({
      ...prev,
      symbol: upper,
      coingecko_id:
        prev.type === "crypto" && POPULAR_CRYPTOS[upper]
          ? POPULAR_CRYPTOS[upper]
          : prev.coingecko_id,
    }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isEdit ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil size={16} />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus size={16} className="mr-2" />
          Agregar Activo
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Activo" : "Nuevo Activo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Bitcoin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Simbolo</Label>
              <Input
                value={form.symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                placeholder="BTC"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={form.type}
              onValueChange={(v) => v && setForm({ ...form, type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ASSET_TYPES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.type === "crypto" && (
            <div className="space-y-2">
              <Label>CoinGecko ID</Label>
              <Input
                value={form.coingecko_id}
                onChange={(e) =>
                  setForm({ ...form, coingecko_id: e.target.value })
                }
                placeholder="bitcoin"
              />
              <p className="text-xs text-muted-foreground">
                Se autocompleta para cryptos populares
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <Input
                type="number"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Precio (USD)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  value={form.current_price}
                  onChange={(e) =>
                    setForm({ ...form, current_price: e.target.value })
                  }
                  className={fetchingPrice ? "pr-8" : ""}
                />
                {fetchingPrice && (
                  <Loader2
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => handleDateChange(e.target.value)}
                required
              />
            </div>
          </div>

          {form.type === "crypto" && form.coingecko_id && (
            <p className="text-xs text-muted-foreground">
              Al cambiar la fecha se busca el precio historico automaticamente desde CoinGecko
            </p>
          )}

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas opcionales..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
