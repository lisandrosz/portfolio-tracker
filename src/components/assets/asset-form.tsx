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
  type AssetType,
  isBtcDenominated,
} from "@/lib/constants";
import { numberToCents } from "@/lib/formatters";
import { Plus, Pencil, Loader2 } from "lucide-react";
import type { Asset } from "@/types";

interface AssetFormProps {
  asset?: Asset;
  onSaved: () => void;
}

export function AssetForm({ asset, onSaved }: AssetFormProps) {
  const isEdit = !!asset;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const [form, setForm] = useState({
    name: asset?.name || "",
    symbol: asset?.symbol || "",
    type: (asset?.type || "crypto") as AssetType,
    coingecko_id: asset?.coingecko_id || "",
    fund_name: asset?.fund_name || "",
    group_name: asset?.group_name || "",
    quantity: asset?.quantity?.toString() || "",
    // For a BTC account current_price is the price of a bitcoin, and the balance
    // — what's editable here — is the quantity.
    price: asset
      ? isBtcDenominated(asset.currency)
        ? asset.quantity.toString()
        : (asset.current_price / 100).toString()
      : "",
    purchase_total: asset?.purchase_total ? (asset.purchase_total / 100).toString() : "",
    purchase_total_usd: asset?.purchase_total_usd
      ? (asset.purchase_total_usd / 100).toString()
      : "",
    installments_total: asset?.installments_total ? asset.installments_total.toString() : "",
    date: asset?.created_at
      ? asset.created_at.split("T")[0]
      : today(),
    notes: asset?.notes || "",
  });

  // FCI fund search
  const [fundQuery, setFundQuery] = useState(asset?.fund_name || "");
  const [fundResults, setFundResults] = useState<
    Array<{ fondo: string; vcp: number; categoria: string }>
  >([]);
  const [showFundDropdown, setShowFundDropdown] = useState(false);
  const [searchingFund, setSearchingFund] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const type = form.type;
  const box = isBoxType(type);
  const installment = isInstallmentType(type);
  const debt = isDebtType(type);
  const currency = asset?.currency ?? ASSET_CURRENCY[type];
  const btcAccount = isBtcDenominated(currency);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowFundDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleFundSearch(query: string) {
    setFundQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 2) {
      setFundResults([]);
      setShowFundDropdown(false);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchingFund(true);
      try {
        const res = await fetch(`/api/prices/fci/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setFundResults(json.data || []);
        setShowFundDropdown(true);
      } finally {
        setSearchingFund(false);
      }
    }, 400);
  }

  function selectFund(fondo: string, vcp: number) {
    const shortSymbol = fondo.split(" ")[0].slice(0, 8).toUpperCase();
    setForm((prev) => ({
      ...prev,
      fund_name: fondo,
      name: fondo,
      symbol: prev.symbol || shortSymbol,
      price: vcp.toString(),
    }));
    setFundQuery(fondo);
    setShowFundDropdown(false);
  }

  const fetchHistoricalPrice = useCallback(async (coinId: string, date: string) => {
    if (!coinId || !date) return;
    setFetchingPrice(true);
    try {
      const res = await fetch(`/api/prices/history?coin_id=${coinId}&date=${date}`);
      const json = await res.json();
      if (json.data?.price) {
        setForm((prev) => ({ ...prev, price: json.data.price.toString() }));
      }
    } finally {
      setFetchingPrice(false);
    }
  }, []);

  function handleDateChange(date: string) {
    setForm((prev) => ({ ...prev, date }));
    if (type === "crypto" && form.coingecko_id) {
      fetchHistoricalPrice(form.coingecko_id, date);
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

  function handleTypeChange(v: string) {
    const t = v as AssetType;
    setForm((prev) => ({
      ...prev,
      type: t,
      // Only for types that are genuinely one account: cash, one per currency.
      // Managed accounts are per exchange, and a BingX default merged the next
      // exchange into the existing row, since assets dedupe on symbol+type.
      name:
        prev.name ||
        (t === "cash_usd" ? "Efectivo USD" : t === "cash_ars" ? "Efectivo ARS" : prev.name),
      symbol:
        prev.symbol ||
        (t === "cash_usd" ? "USD" : t === "cash_ars" ? "ARS" : prev.symbol),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        // Edit: update name, notes, current price/balance, price source.
        const body: Record<string, unknown> = {
          name: form.name,
          symbol: form.symbol,
          coingecko_id: type === "crypto" && form.coingecko_id ? form.coingecko_id : null,
          fund_name: type === "fci" && form.fund_name ? form.fund_name : null,
          group_name: form.group_name || null,
          notes: form.notes || null,
        };
        if (installment) {
          // current_price is derived from the cuota ledger — the API rejects it.
          body.purchase_total = numberToCents(parseFloat(form.purchase_total) || 0);
          body.purchase_total_usd = numberToCents(parseFloat(form.purchase_total_usd) || 0);
          body.installments_total = parseInt(form.installments_total) || 0;
        } else if (debt) {
          // Balance comes from the alta/pago ledger; only the label is editable.
        } else if (btcAccount) {
          // Bitcoin, not cents: the API rejects a dollar figure here, because
          // current_price is the market price and CoinGecko owns it.
          body.quantity = parseFloat(form.price) || 0;
        } else {
          body.current_price = numberToCents(parseFloat(form.price) || 0);
        }
        await fetch(`/api/assets/${asset!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const body: Record<string, unknown> = {
          name: form.name,
          symbol: form.symbol,
          type,
          coingecko_id: type === "crypto" && form.coingecko_id ? form.coingecko_id : null,
          fund_name: type === "fci" && form.fund_name ? form.fund_name : null,
          group_name: form.group_name || null,
          quantity: box || installment || debt ? 0 : parseFloat(form.quantity) || 0,
          price: installment ? 0 : parseFloat(form.price) || 0,
          date: form.date,
          notes: form.notes || null,
        };
        if (installment) {
          body.purchase_total = parseFloat(form.purchase_total) || 0;
          body.installments_total = parseInt(form.installments_total) || 0;
        }
        await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setOpen(false);
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  const priceLabel = box
    ? isEdit
      ? `Saldo actual (${currency})`
      : `Saldo inicial (${currency})`
    : isEdit
      ? `Precio actual (${currency})`
      : `Precio (${currency})`;

  const btcHint = btcAccount && isEdit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isEdit ? (
        <DialogTrigger render={<Button variant="ghost" size="icon" />}>
          <Pencil size={16} />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus size={16} className="mr-2" />
          Activo
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md bg-card border border-border">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Activo" : "Nuevo Activo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => v && handleTypeChange(v)}>
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
          )}

          {/* FCI fund search */}
          {type === "fci" && !isEdit && (
            <div className="space-y-2" ref={dropdownRef}>
              <Label>Buscar fondo (Cocos, etc.)</Label>
              <div className="relative">
                <Input
                  value={fundQuery}
                  onChange={(e) => handleFundSearch(e.target.value)}
                  placeholder="Ej: Cocos Pesos Plus"
                  autoComplete="off"
                />
                {searchingFund && (
                  <Loader2
                    size={14}
                    className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                  />
                )}
                {showFundDropdown && fundResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover rounded-lg border border-border shadow-lg max-h-48 overflow-y-auto">
                    {fundResults.map((r) => (
                      <button
                        key={r.fondo}
                        type="button"
                        onClick={() => selectFund(r.fondo, r.vcp)}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between text-sm"
                      >
                        <span className="font-medium">{r.fondo}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ${r.vcp}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                El precio de la cuotaparte se actualiza solo
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={type === "crypto" ? "Bitcoin" : "Nombre"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Símbolo</Label>
              <Input
                value={form.symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                placeholder={type === "crypto" ? "BTC" : "—"}
                required
              />
            </div>
          </div>

          {type === "crypto" && (
            <div className="space-y-2">
              <Label>CoinGecko ID</Label>
              <Input
                value={form.coingecko_id}
                onChange={(e) => setForm({ ...form, coingecko_id: e.target.value })}
                placeholder="bitcoin"
              />
              <p className="text-xs text-muted-foreground">
                Se autocompleta para cryptos populares
              </p>
            </div>
          )}

          {type === "managed" && !isEdit && (
            <p className="text-xs text-muted-foreground bg-muted rounded-md p-2">
              Cargá el saldo actual de tu cuenta. Si es la de BingX, podés conectar la
              API en Ajustes para que se actualice sola; el resto se cargan a mano.
            </p>
          )}

          {/* Amounts */}
          {debt ? (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              El saldo sale de las altas y pagos cargados. Para corregirlo, editá los
              movimientos en vez de este campo.
            </p>
          ) : installment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Precio total ({currency})</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.purchase_total}
                    onChange={(e) => setForm({ ...form, purchase_total: e.target.value })}
                    placeholder="150000000"
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
              {isEdit && (
                <div className="space-y-2">
                  <Label>Tasación (USD)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.purchase_total_usd}
                    onChange={(e) => setForm({ ...form, purchase_total_usd: e.target.value })}
                    placeholder="100000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor en dólares congelado al día de la compra. No se mueve con el blue: eso es
                    lo que hace que la devaluación licúe la deuda en vez de achicar el terreno.
                    Editalo solo si el terreno se revaluó de verdad.
                  </p>
                </div>
              )}
              {isEdit && (
                <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  El saldo pagado no se edita acá: sale de las cuotas cargadas. Para corregirlo,
                  borrá o agregá cuotas en Movimientos.
                </p>
              )}
              {!isEdit && (
                <div className="space-y-2">
                  <Label>Fecha de compra</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          ) : (
            <div className={box ? "grid grid-cols-2 gap-4" : "grid grid-cols-3 gap-4"}>
              {!box && (
                <div className="space-y-2">
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    placeholder="0.05"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{priceLabel}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="any"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
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
              {!isEdit && (
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {btcHint && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              El saldo va en BTC. Actualizalo con lo que muestre la cuenta cuando el copytrading
              lo mueva; el valor en dólares se recalcula solo con el precio de bitcoin.
            </p>
          )}

          {type === "crypto" && form.coingecko_id && !isEdit && (
            <p className="text-xs text-muted-foreground">
              Al cambiar la fecha se busca el precio histórico desde CoinGecko
            </p>
          )}

          <div className="space-y-2">
            <Label>Grupo (opcional)</Label>
            <Input
              value={form.group_name}
              onChange={(e) => setForm({ ...form, group_name: e.target.value })}
              placeholder="Ej: BingX Copytrading"
            />
            <p className="text-xs text-muted-foreground">
              Los activos con el mismo grupo se muestran juntos, con su total y rendimiento
              consolidado. Útil para separar estrategias de copytrading.
            </p>
          </div>

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
              {loading ? "Guardando..." : isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
