"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
    yahoo_symbol: asset?.yahoo_symbol || "",
    quantity: asset?.quantity?.toString() || "0",
    current_price: asset ? (asset.current_price / 100).toString() : "0",
    date: asset?.created_at ? asset.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
    notes: asset?.notes || "",
  });

  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [dolarBlue, setDolarBlue] = useState<number | null>(null);
  const [symbolQuery, setSymbolQuery] = useState("");
  const [symbolResults, setSymbolResults] = useState<Array<{ symbol: string; name: string; exchange: string }>>([]);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [searchingSymbol, setSearchingSymbol] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEdit = !!asset;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSymbolDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSymbolSearch(query: string) {
    setSymbolQuery(query);
    setForm((prev) => ({ ...prev, yahoo_symbol: query }));

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (query.length < 2) {
      setSymbolResults([]);
      setShowSymbolDropdown(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearchingSymbol(true);
      try {
        const res = await fetch(`/api/prices/stocks/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setSymbolResults(json.data || []);
        setShowSymbolDropdown(true);
      } finally {
        setSearchingSymbol(false);
      }
    }, 500);
  }

  async function selectSymbol(symbol: string, name: string) {
    setForm((prev) => ({ ...prev, yahoo_symbol: symbol, name: name || prev.name }));
    setSymbolQuery(symbol);
    setShowSymbolDropdown(false);

    // Auto-fetch price
    setFetchingPrice(true);
    try {
      const res = await fetch(`/api/prices/stocks/quote?symbol=${encodeURIComponent(symbol)}`);
      const json = await res.json();
      if (json.data?.price) {
        setForm((prev) => ({ ...prev, current_price: json.data.price.toString() }));
      }
    } finally {
      setFetchingPrice(false);
    }
  }

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

  async function handleCurrencyChange(cur: "USD" | "ARS") {
    setCurrency(cur);
    if (cur === "ARS" && !dolarBlue) {
      try {
        const res = await fetch("/api/prices/dolar");
        const json = await res.json();
        if (json.data?.venta) {
          setDolarBlue(json.data.venta);
        }
      } catch { /* ignore */ }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    let priceUsd = parseFloat(form.current_price) || 0;
    if (currency === "ARS" && dolarBlue && dolarBlue > 0) {
      priceUsd = priceUsd / dolarBlue;
    }

    const body = {
      name: form.name,
      symbol: form.symbol,
      type: form.type,
      coingecko_id: form.type === "crypto" && form.coingecko_id ? form.coingecko_id : null,
      yahoo_symbol: form.type === "cedear" && form.yahoo_symbol ? form.yahoo_symbol : null,
      quantity: parseFloat(form.quantity) || 0,
      current_price: numberToCents(priceUsd),
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

          {form.type === "cedear" && (
            <div className="space-y-2" ref={dropdownRef}>
              <Label>Buscar Simbolo</Label>
              <div className="relative">
                <Input
                  value={symbolQuery || form.yahoo_symbol}
                  onChange={(e) => handleSymbolSearch(e.target.value)}
                  placeholder="Busca: SPY, MELI, AAPL..."
                  autoComplete="off"
                />
                {searchingSymbol && (
                  <Loader2
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                  />
                )}
                {showSymbolDropdown && symbolResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white rounded-lg border border-border shadow-lg max-h-48 overflow-y-auto">
                    {symbolResults.map((r) => (
                      <button
                        key={r.symbol}
                        type="button"
                        onClick={() => selectSymbol(r.symbol, r.name)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between text-sm"
                      >
                        <div>
                          <span className="font-medium">{r.symbol}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {r.name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {r.exchange}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Escribi el nombre o ticker y selecciona de la lista
              </p>
            </div>
          )}

          <div className="flex gap-2 items-center">
            <Label className="text-sm">Moneda:</Label>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => handleCurrencyChange("USD")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  currency === "USD"
                    ? "bg-emerald-500 text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                USD
              </button>
              <button
                type="button"
                onClick={() => handleCurrencyChange("ARS")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  currency === "ARS"
                    ? "bg-emerald-500 text-white"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                ARS
              </button>
            </div>
            {currency === "ARS" && dolarBlue && (
              <span className="text-xs text-muted-foreground">
                Dolar blue: ${dolarBlue.toLocaleString()}
              </span>
            )}
          </div>

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
              <Label>Precio ({currency})</Label>
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
