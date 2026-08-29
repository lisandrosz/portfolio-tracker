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
import { today } from "@/lib/dates";
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
  isInstallmentType,
  isDebtType,
  isPayableType,
  debtCounterLegType,
  type AssetType,
} from "@/lib/constants";
import { Plus, Loader2, Lock } from "lucide-react";
import { centsToUsd, formatMoney, numberToCents } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Asset } from "@/types";

const NEW = "__new__";
// A debt you settle outside anything tracked here: no account leg to write.
const NO_ACCOUNT = "__none__";

interface Props {
  assets: Asset[];
  onSaved: () => void;
}

export function OrderForm({ assets, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const [mode, setMode] = useState<"order" | "transfer">("order");
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const [assetChoice, setAssetChoice] = useState(NEW);
  const [orderType, setOrderType] = useState("buy"); // for existing assets
  // Account a debt movement runs through (optional).
  const [counterAccount, setCounterAccount] = useState(NO_ACCOUNT);
  const [form, setForm] = useState({
    newType: "crypto" as AssetType,
    symbol: "",
    name: "",
    group_name: "",
    coingecko_id: "",
    fund_name: "",
    quantity: "",
    price: "",
    amount: "",
    purchase_total: "",
    installments_total: "",
    usd_rate: "",
    fee: "0",
    date: today(),
    notes: "",
  });

  // The suggested rate is refreshed whenever the date changes; a rate the user
  // typed survives until then.
  const [rateTouched, setRateTouched] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);

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
  const installment = isInstallmentType(assetType);
  const debt = isDebtType(assetType);
  const payable = isPayableType(assetType);
  // Debts and boxes are both "one amount moves the balance" forms.
  const amountForm = box || installment || debt;
  const currency = ASSET_CURRENCY[assetType];
  const needsRate = currency === "ARS";

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

  const fetchRate = useCallback(async (date: string) => {
    if (!date) return;
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/prices/dolar?date=${date}`);
      const json = await res.json();
      if (json.data?.venta) setForm((p) => ({ ...p, usd_rate: json.data.venta.toString() }));
    } finally {
      setFetchingRate(false);
    }
  }, []);

  // Suggest the rate as soon as an ARS asset is in play.
  useEffect(() => {
    if (open && needsRate && !rateTouched) fetchRate(form.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsRate, assetChoice, form.newType]);

  function reset() {
    setMode("order");
    setTransferFrom("");
    setTransferTo("");
    setAssetChoice(NEW);
    setOrderType("buy");
    setCounterAccount(NO_ACCOUNT);
    setFundQuery("");
    setRateTouched(false);
    setForm({
      newType: "crypto",
      symbol: "",
      name: "",
      group_name: "",
      coingecko_id: "",
      fund_name: "",
      quantity: "",
      price: "",
      amount: "",
      purchase_total: "",
      installments_total: "",
      usd_rate: "",
      fee: "0",
      date: today(),
      notes: "",
    });
  }

  function chooseAsset(v: string) {
    if (!v) return;
    setAssetChoice(v);
    // The account belongs to the movement being loaded, not to the last one.
    setCounterAccount(NO_ACCOUNT);
    if (v === NEW) {
      setOrderType("buy");
      return;
    }
    const a = assets.find((x) => x.id.toString() === v);
    const nowBox = a ? isBoxType(a.type) : false;
    const nowInstallment = a ? isInstallmentType(a.type) : false;
    const nowDebt = a ? isDebtType(a.type) : false;
    // Default to the movement you actually reach for: settling, not growing.
    setOrderType(
      nowInstallment ? "cuota" : nowDebt ? "pago" : nowBox ? "deposit" : "buy"
    );
    // auto-fill current price for buys
    setForm((p) => ({
      ...p,
      price:
        !nowBox && !nowInstallment && !nowDebt && a?.current_price
          ? (a.current_price / 100).toString()
          : p.price,
    }));
  }

  function changeNewType(v: string) {
    const t = v as AssetType;
    setForm((p) => ({
      ...p,
      newType: t,
      name:
        p.name ||
        (t === "managed"
          ? "BingX Copytrading"
          : t === "cash_usd"
            ? "Efectivo USD"
            : t === "cash_ars"
              ? "Efectivo ARS"
              : ""),
      symbol:
        p.symbol ||
        (t === "managed" ? "BINGX" : t === "cash_usd" ? "USD" : t === "cash_ars" ? "ARS" : ""),
    }));
    setRateTouched(false);
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
    // The rate belongs to the date, so a new date re-suggests it.
    if (needsRate) {
      setRateTouched(false);
      fetchRate(date);
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

  const rate = parseFloat(form.usd_rate) || 0;

  /** Native-currency cents this order will freeze, for the live preview. */
  function previewNative(): number {
    if (isNew && installment) return numberToCents(parseFloat(form.purchase_total) || 0);
    if (isNew && debt) return numberToCents(parseFloat(form.amount) || 0);
    if (amountForm) return numberToCents(parseFloat(form.amount) || 0);
    const qty = parseFloat(form.quantity) || 0;
    return Math.round(qty * numberToCents(parseFloat(form.price) || 0));
  }

  const previewUsd = rate > 0 ? Math.round(previewNative() / rate) : 0;

  // Remaining debt, for cuota validation and the "cuota sugerida" shortcut.
  const remaining =
    selected && installment ? Math.max(0, selected.purchase_total - selected.current_price) : 0;
  const suggestedCuota =
    selected && installment && selected.installments_total > 0
      ? Math.round(selected.purchase_total / selected.installments_total)
      : 0;

  // Accounts money can move between: box balances only.
  const boxAssets = assets.filter((a) => isBoxType(a.type));
  const fromAsset = boxAssets.find((a) => a.id.toString() === transferFrom);

  // Accounts that can back a debt movement. Same currency only: settling a USD
  // debt out of a peso account is a conversion at some rate, not a transfer, and
  // the backend refuses to invent one.
  const counterOptions = debt ? boxAssets.filter((a) => a.currency === currency) : [];
  const counterAsset = counterOptions.find((a) => a.id.toString() === counterAccount);
  // A new debt opens with an alta; an existing one moves by the chosen order type.
  const counterFlow = debtCounterLegType(assetType, isNew ? "alta" : orderType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "transfer") {
        const body: Record<string, unknown> = {
          from_asset_id: parseInt(transferFrom),
          to_asset_id: parseInt(transferTo),
          amount: parseFloat(form.amount) || 0,
          date: form.date,
          notes: form.notes || null,
        };
        if (fromAsset?.currency === "ARS" && rate > 0) body.usd_rate = rate;

        const res = await fetch("/api/transactions/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          alert(typeof json.error === "string" ? json.error : "No se pudo transferir");
          return;
        }
        setOpen(false);
        reset();
        onSaved();
        return;
      }

      if (isNew) {
        // Create asset + opening order in one shot.
        // Debts have no ticker; derive a readable one from the counterparty.
        const symbol = debt
          ? form.name.trim().split(/\s+/)[0].slice(0, 8).toUpperCase() || "DEUDA"
          : form.symbol;
        const body: Record<string, unknown> = {
          name: form.name,
          symbol,
          type: form.newType,
          group_name: form.group_name || null,
          coingecko_id: form.newType === "crypto" && form.coingecko_id ? form.coingecko_id : null,
          fund_name: form.newType === "fci" && form.fund_name ? form.fund_name : null,
          quantity: amountForm ? 0 : parseFloat(form.quantity) || 0,
          price: installment
            ? parseFloat(form.price) || 0 // down payment
            : box || debt
              ? parseFloat(form.amount) || 0 // opening balance
              : parseFloat(form.price) || 0,
          date: form.date,
          notes: form.notes || null,
        };
        if (installment) {
          body.purchase_total = parseFloat(form.purchase_total) || 0;
          body.installments_total = parseInt(form.installments_total) || 0;
        }
        if (needsRate && rate > 0) body.usd_rate = rate;
        // The account the lent/borrowed money moved through, if it was tracked.
        if (debt && counterAsset) body.counter_asset_id = counterAsset.id;

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
        if (amountForm) body.amount = parseFloat(form.amount) || 0;
        else {
          body.quantity = parseFloat(form.quantity) || 0;
          body.price = parseFloat(form.price) || 0;
        }
        if (needsRate && rate > 0) body.usd_rate = rate;
        if (debt && counterAsset) body.counter_asset_id = counterAsset.id;

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
  const typeOptions = installment
    ? [
        { key: "cuota", label: "Cuota" },
        { key: "gasto", label: "Gasto administrativo" },
      ]
    : debt
      ? [
          { key: "pago", label: payable ? "Le pagué" : "Me pagó" },
          { key: "alta", label: payable ? "Me prestaron más" : "Le presté más" },
        ]
      : box
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
          <DialogTitle>{mode === "transfer" ? "Transferencia" : "Nueva orden"}</DialogTitle>
        </DialogHeader>

        {/* Transfers move money between accounts you already have, so they are a
            different operation, not another kind of order. */}
        {boxAssets.length >= 2 && (
          <div className="flex gap-1 rounded-lg bg-muted p-0.5 text-xs">
            {(["order", "transfer"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "order" ? "Orden" : "Transferencia"}
              </button>
            ))}
          </div>
        )}

        {mode === "transfer" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Desde</Label>
              <Select value={transferFrom} onValueChange={(v) => v && setTransferFrom(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Cuenta de origen">
                    {(v) => {
                      const a = boxAssets.find((x) => x.id.toString() === v);
                      return a ? `${a.symbol} · ${a.name}` : "Cuenta de origen";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {boxAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.symbol} — {formatMoney(a.current_price, a.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Hacia</Label>
              <Select value={transferTo} onValueChange={(v) => v && setTransferTo(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Cuenta de destino">
                    {(v) => {
                      const a = boxAssets.find((x) => x.id.toString() === v);
                      return a ? `${a.symbol} · ${a.name}` : "Cuenta de destino";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {boxAssets
                    .filter((a) => a.id.toString() !== transferFrom)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id.toString()}>
                        {a.symbol} — {formatMoney(a.current_price, a.currency)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Monto ({fromAsset?.currency ?? "USD"})</Label>
                {fromAsset && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, amount: (fromAsset.current_price / 100).toString() })
                    }
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Todo el saldo
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="any"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="200"
                required
              />
              {fromAsset && (
                <p className="text-xs text-muted-foreground">
                  Disponible: {formatMoney(fromAsset.current_price, fromAsset.currency)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>

            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Se registran los dos lados de una: retiro en el origen y aporte en el destino. No
              afecta la ganancia de ninguna de las dos cuentas — mover plata no es rendimiento.
            </p>

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
              <Button type="submit" disabled={loading || !transferFrom || !transferTo}>
                {loading ? "Transfiriendo..." : "Transferir"}
              </Button>
            </div>
          </form>
        ) : (
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

              {/* Debts are identified by who owes whom, so no ticker to ask for. */}
              {debt ? (
                <div className="space-y-2">
                  <Label>{payable ? "¿A quién le debo?" : "¿Quién me debe?"}</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={payable ? "Alquiler, Mamá, Tarjeta" : "Juan, Hermano"}
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder={
                        form.newType === "crypto"
                          ? "Bitcoin"
                          : form.newType === "terreno"
                            ? "Lote 42, Barrio X"
                            : "Nombre"
                      }
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
              )}

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

              {/* Grouping earns its place on managed accounts: one BingX account
                  holding several copied strategies. */}
              {form.newType === "managed" && (
                <div className="space-y-2">
                  <Label>Grupo (opcional)</Label>
                  <Input
                    value={form.group_name}
                    onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                    placeholder="BingX Copytrading"
                  />
                  <p className="text-xs text-muted-foreground">
                    Poné el mismo grupo en cada estrategia y se muestran juntas, con total y
                    rendimiento consolidado.
                  </p>
                </div>
              )}

              {installment && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Precio total (ARS)</Label>
                    <Input
                      type="number"
                      step="any"
                      value={form.purchase_total}
                      onChange={(e) => setForm({ ...form, purchase_total: e.target.value })}
                      placeholder="150000000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cantidad de cuotas</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={form.installments_total}
                      onChange={(e) => setForm({ ...form, installments_total: e.target.value })}
                      placeholder="60"
                    />
                  </div>
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
          {isNew && installment ? (
            <div className="space-y-2">
              <Label>Anticipo / seña pagada hoy ({currency})</Label>
              <Input
                type="number"
                step="any"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Dejalo en 0 si todavía no pagaste nada. Después cargás cada cuota.
              </p>
            </div>
          ) : amountForm ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {isNew
                    ? debt
                      ? `${payable ? "Cuánto debo" : "Cuánto me deben"} (${currency})`
                      : `Saldo inicial (${currency})`
                    : `Monto (${currency})`}
                </Label>
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
                {!isNew && orderType === "pago" && selected && selected.current_price > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, amount: (selected.current_price / 100).toString() })
                    }
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Saldar todo
                  </button>
                )}
                {!isNew && orderType === "cuota" && suggestedCuota > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, amount: (suggestedCuota / 100).toString() })}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Cuota sugerida {formatMoney(suggestedCuota, currency)}
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
              {!isNew && installment && selected && (
                <p className="text-xs text-muted-foreground">
                  Saldo restante: {formatMoney(remaining, currency)}
                  {selected.installments_total > 0 && ` · ${selected.installments_total} cuotas pactadas`}
                </p>
              )}
              {!isNew && debt && selected && (
                <p className="text-xs text-muted-foreground">
                  Saldo pendiente: {formatMoney(selected.current_price, currency)}
                </p>
              )}
              {isNew && debt && (
                <p className="text-xs text-muted-foreground">
                  {payable
                    ? "Resta de tu patrimonio neto. Después vas cargando los pagos que hacés."
                    : "Suma a tu patrimonio neto. Después vas cargando lo que te van pagando."}
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

          {/* The other half of a debt movement. Cancelling a debt without banking
              the money looks exactly like losing it, so the account leg is right
              next to the amount instead of being something you remember later. */}
          {debt && counterOptions.length > 0 && (
            <div className="space-y-2">
              <Label>
                {counterFlow === "deposit"
                  ? "¿A dónde entró la plata?"
                  : "¿De dónde salió la plata?"}
              </Label>
              <Select value={counterAccount} onValueChange={(v) => v && setCounterAccount(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ninguna">
                    {(v) => {
                      const a = counterOptions.find((x) => x.id.toString() === v);
                      return a ? `${a.symbol} · ${a.name}` : "Ninguna (no la trackeo)";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>Ninguna (no la trackeo)</SelectItem>
                  {counterOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.symbol} — {formatMoney(a.current_price, a.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {counterAsset ? (
                  <>
                    Se registra {counterFlow === "deposit" ? "un aporte en" : "un retiro de"}{" "}
                    <span className="font-medium text-foreground">{counterAsset.symbol}</span> por el
                    mismo monto. Tu patrimonio neto no se mueve: la plata cambia de lugar, no
                    aparece ni desaparece.
                  </>
                ) : (
                  <>
                    Sin cuenta, la plata no{" "}
                    {counterFlow === "deposit" ? "entra a ningún lado" : "sale de ningún lado"}: tu
                    patrimonio neto va a {counterFlow === "deposit" ? "bajar" : "subir"}
                    {previewNative() > 0 ? ` ${formatMoney(previewNative(), currency)}` : ""}.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={form.date} onChange={(e) => changeDate(e.target.value)} required />
            </div>
            {!amountForm && (
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

          {/* Editable exchange rate. Suggested from the date: the rate you set in
              Ajustes for today, the published blue for a past date. Frozen on save. */}
          {needsRate && (
            <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Lock size={12} className="text-primary" />
                  Cotización USD (ARS por dólar)
                </Label>
                {rateTouched && (
                  <button
                    type="button"
                    onClick={() => {
                      setRateTouched(false);
                      fetchRate(form.date);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Usar la del día
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  value={form.usd_rate}
                  onChange={(e) => {
                    setRateTouched(true);
                    setForm({ ...form, usd_rate: e.target.value });
                  }}
                  placeholder="1485"
                />
                {fetchingRate && (
                  <Loader2
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {previewUsd > 0 ? (
                  <>
                    Se congela como{" "}
                    <span className="font-medium text-foreground">{centsToUsd(previewUsd)}</span>
                    {isNew && installment ? " de tasación. " : ". "}
                    Este valor no se recalcula nunca.
                  </>
                ) : (
                  <>
                    Sugerida según la cotización de la fecha elegida. Editala si conseguiste los
                    dólares a otro precio.
                  </>
                )}
              </p>
            </div>
          )}

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
        )}
      </DialogContent>
    </Dialog>
  );
}
