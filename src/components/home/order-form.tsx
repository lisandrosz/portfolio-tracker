"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  ASSET_TYPES,
  ASSET_CURRENCY,
  POPULAR_CRYPTOS,
  isBoxType,
  type AssetType,
} from "@/lib/constants";
import { Plus, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/formatters";
import type { Asset } from "@/types";

const NEW = "__new__";

interface Props {
  assets: Asset[];
  onSaved: () => void;
}

const todayStr = () => new Date().toISOString().split("T")[0];

export function OrderForm({ assets, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const [assetChoice, setAssetChoice] = useState(NEW);
  const [orderType, setOrderType] = useState("buy"); // for existing assets
  const [form, setForm] = useState({
    newType: "crypto" as AssetType,
    symbol: "",
    name: "",
    coingecko_id: "",
    fund_name: "",
    quantity: "",
    price: "",
    amount: "",
    fee: "0",
    date: todayStr(),
    notes: "",
  });

  // FCI fund search
  const [fundQuery, setFundQuery] = useState("");
  const [fundResults, setFundResults] = useState<Array<{ fondo: string; vcp: number }>>([]);
  const [showFund, setShowFund] = useState(false);
  const [searchingFund, setSearchingFund] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fundRef = useRef<HTMLDivElement>(null);

  const isNew = assetChoice === NEW;
  const selected = assets.find((a) => a.id.toString() === assetChoice);
  const assetType: AssetType = isNew ? form.newType : (selected?.type as AssetType) ?? "crypto";
  const box = isBoxType(assetType);
  const currency = ASSET_CURRENCY[assetType];

  function assetLabel(v: string) {
    if (!v) return "Elegí o creá un activo";
    if (v === NEW) return "➕ Nuevo activo";
    const a = assets.find((x) => x.id.toString() === v);
    return a ? `${a.symbol} · ${a.name}` : "Seleccionar";
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (fundRef.current && !fundRef.current.contains(e.target as Node)) setShowFund(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function reset() {
    setAssetChoice(NEW);
    setOrderType("buy");
    setFundQuery("");
    setForm({
      newType: "crypto",
      symbol: "",
      name: "",
      coingecko_id: "",
      fund_name: "",
      quantity: "",
      price: "",
      amount: "",
      fee: "0",
      date: todayStr(),
      notes: "",
    });
  }

  function chooseAsset(v: string) {
    if (!v) return;
    setAssetChoice(v);
    if (v === NEW) {
      setOrderType("buy");
      return;
    }
    const a = assets.find((x) => x.id.toString() === v);
    const nowBox = a ? isBoxType(a.type) : false;
    setOrderType(nowBox ? "deposit" : "buy");
    // auto-fill current price for buys
    setForm((p) => ({
      ...p,
      price: !nowBox && a?.current_price ? (a.current_price / 100).toString() : p.price,
    }));
  }

  function changeNewType(v: string) {
    const t = v as AssetType;
    setForm((p) => ({
      ...p,
      newType: t,
      name:
        p.name ||
        (t === "managed" ? "BingX Copytrading" : t === "cash_usd" ? "Efectivo USD" : t === "cash_ars" ? "Efectivo ARS" : ""),
      symbol: p.symbol || (t === "managed" ? "BINGX" : t === "cash_usd" ? "USD" : t === "cash_ars" ? "ARS" : ""),
    }));
  }

  function changeSymbol(val: string) {
    const up = val.toUpperCase();
    setForm((p) => ({
      ...p,
      symbol: up,
      coingecko_id: p.newType === "crypto" && POPULAR_CRYPTOS[up] ? POPULAR_CRYPTOS[up] : p.coingecko_id,
    }));
  }

  const fetchHistorical = useCallback(async (coinId: string, date: string) => {
    if (!coinId || !date) return;
    setFetchingPrice(true);
    try {
      const res = await fetch(`/api/prices/history?coin_id=${coinId}&date=${date}`);
      const json = await res.json();
      if (json.data?.price) setForm((p) => ({ ...p, price: json.data.price.toString() }));
    } finally {
      setFetchingPrice(false);
    }
  }, []);

  function changeDate(date: string) {
    setForm((p) => ({ ...p, date }));
    if (isNew && form.newType === "crypto" && form.coingecko_id) {
      fetchHistorical(form.coingecko_id, date);
    }
  }

  function searchFund(q: string) {
    setFundQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) {
      setFundResults([]);
      setShowFund(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchingFund(true);
      try {
        const res = await fetch(`/api/prices/fci/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setFundResults(json.data || []);
        setShowFund(true);
      } finally {
        setSearchingFund(false);
      }
    }, 400);
  }

  function pickFund(fondo: string, vcp: number) {
    const sym = fondo.split(" ")[0].slice(0, 8).toUpperCase();
    setForm((p) => ({ ...p, fund_name: fondo, name: fondo, symbol: p.symbol || sym, price: vcp.toString() }));
    setFundQuery(fondo);
    setShowFund(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isNew) {
        // Create asset + opening order in one shot.
        const body = {
          name: form.name,
          symbol: form.symbol,
          type: form.newType,
          coingecko_id: form.newType === "crypto" && form.coingecko_id ? form.coingecko_id : null,
          fund_name: form.newType === "fci" && form.fund_name ? form.fund_name : null,
          quantity: box ? 0 : parseFloat(form.quantity) || 0,
          price: box ? parseFloat(form.amount) || 0 : parseFloat(form.price) || 0,
          date: form.date,
          notes: form.notes || null,
        };
        const res = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          alert("No se pudo crear el activo");
          return;
        }
      } else {
        const body: Record<string, unknown> = {
          asset_id: parseInt(assetChoice),
          type: orderType,
          fee: parseFloat(form.fee) || 0,
          date: form.date,
          notes: form.notes || null,
        };
        if (box) body.amount = parseFloat(form.amount) || 0;
        else {
          body.quantity = parseFloat(form.quantity) || 0;
          body.price = parseFloat(form.price) || 0;
        }
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          alert(typeof json.error === "string" ? json.error : "No se pudo registrar la orden");
          return;
        }
      }
      setOpen(false);
      reset();
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  // order type options (existing assets only)
  const typeOptions = box
    ? [
        { key: "deposit", label: "Aporte (agregar capital)" },
        { key: "withdrawal", label: "Retiro (quitar capital)" },
      ]
    : [
        { key: "buy", label: "Compra" },
        { key: "sell", label: "Venta" },
      ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          // default to "new" when there are no assets yet
          setAssetChoice(assets.length === 0 ? NEW : NEW);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus size={16} className="mr-2" />
        Nueva orden
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva orden</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Asset picker */}
          <div className="space-y-2">
            <Label>Activo</Label>
            <Select value={assetChoice} onValueChange={(v) => v && chooseAsset(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí o creá un activo">
                  {(v) => assetLabel(v as string)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW}>➕ Nuevo activo</SelectItem>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.symbol} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* New asset definition */}
          {isNew && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="space-y-2">
                <Label>Tipo de activo</Label>
                <Select value={form.newType} onValueChange={(v) => v && changeNewType(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => ASSET_TYPES[v as AssetType] ?? ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ASSET_TYPES).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.newType === "fci" && (
                <div className="space-y-2" ref={fundRef}>
                  <Label>Buscar fondo (Cocos, etc.)</Label>
                  <div className="relative">
                    <Input
                      value={fundQuery}
                      onChange={(e) => searchFund(e.target.value)}
                      placeholder="Ej: Cocos Ahorro"
                      autoComplete="off"
                    />
                    {searchingFund && (
                      <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                    {showFund && fundResults.length > 0 && (
                      <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                        {fundResults.map((r) => (
                          <button
                            key={r.fondo}
                            type="button"
                            onClick={() => pickFund(r.fondo, r.vcp)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span className="font-medium">{r.fondo}</span>
                            <span className="ml-2 text-xs text-muted-foreground">${r.vcp}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={form.newType === "crypto" ? "Bitcoin" : "Nombre"}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Símbolo</Label>
                  <Input
                    value={form.symbol}
                    onChange={(e) => changeSymbol(e.target.value)}
                    placeholder={form.newType === "crypto" ? "BTC" : "—"}
                    required
                  />
                </div>
              </div>

              {form.newType === "crypto" && (
                <div className="space-y-2">
                  <Label>CoinGecko ID</Label>
                  <Input
                    value={form.coingecko_id}
                    onChange={(e) => setForm({ ...form, coingecko_id: e.target.value })}
                    placeholder="bitcoin"
                  />
                </div>
              )}
            </div>
          )}

          {/* Order type (existing assets) */}
          {!isNew && (
            <div className="space-y-2">
              <Label>Tipo de orden</Label>
              <Select value={orderType} onValueChange={(v) => v && setOrderType(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => typeOptions.find((o) => o.key === v)?.label ?? ""}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amounts */}
          {box ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{isNew ? `Saldo inicial (${currency})` : `Monto (${currency})`}</Label>
                {!isNew && orderType === "withdrawal" && selected && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, amount: (selected.current_price / 100).toString() })
                    }
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Retirar todo
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="any"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1000"
                required
              />
              {!isNew && orderType === "withdrawal" && selected && (
                <p className="text-xs text-muted-foreground">
                  Saldo disponible: {formatMoney(selected.current_price, currency)}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="0.05"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Precio ({currency})</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="any"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="67500"
                    required
                  />
                  {fetchingPrice && (
                    <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={form.date} onChange={(e) => changeDate(e.target.value)} required />
            </div>
            {!box && (
              <div className="space-y-2">
                <Label>Fee ({currency})</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: e.target.value })}
                />
              </div>
            )}
          </div>

          {isNew && form.newType === "crypto" && form.coingecko_id && (
            <p className="text-xs text-muted-foreground">
              Al cambiar la fecha se sugiere el precio histórico. Podés editarlo con tu precio real de compra.
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
