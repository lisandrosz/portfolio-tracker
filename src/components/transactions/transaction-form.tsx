"use client";

import { useState } from "react";
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
import { TRANSACTION_TYPES } from "@/lib/constants";
import { numberToCents } from "@/lib/formatters";
import { Plus } from "lucide-react";
import type { Asset } from "@/types";

interface TransactionFormProps {
  assets: Asset[];
  onSaved: () => void;
  defaultAssetId?: number;
}

export function TransactionForm({
  assets,
  onSaved,
  defaultAssetId,
}: TransactionFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD");
  const [dolarBlue, setDolarBlue] = useState<number | null>(null);
  const [form, setForm] = useState({
    asset_id: defaultAssetId?.toString() || "",
    type: "buy",
    quantity: "",
    price: "",
    fee: "0",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

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

    const isIncomeType = ["interest", "dividend"].includes(form.type);
    let feeUsd = parseFloat(form.fee) || 0;
    if (currency === "ARS" && dolarBlue && dolarBlue > 0) {
      feeUsd = feeUsd / dolarBlue;
    }

    let body;
    if (isIncomeType) {
      // Interest/dividend: quantity=0, price=0, total=monto
      let montoUsd = parseFloat(form.price);
      if (currency === "ARS" && dolarBlue && dolarBlue > 0) {
        montoUsd = montoUsd / dolarBlue;
      }
      body = {
        asset_id: parseInt(form.asset_id),
        type: form.type,
        quantity: 0,
        price: 0,
        total: numberToCents(montoUsd),
        fee: numberToCents(feeUsd),
        date: form.date,
        notes: form.notes || null,
      };
    } else {
      let priceUsd = parseFloat(form.price);
      if (currency === "ARS" && dolarBlue && dolarBlue > 0) {
        priceUsd = priceUsd / dolarBlue;
      }
      body = {
        asset_id: parseInt(form.asset_id),
        type: form.type,
        quantity: parseFloat(form.quantity),
        price: numberToCents(priceUsd),
        fee: numberToCents(feeUsd),
        date: form.date,
        notes: form.notes || null,
      };
    }

    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setOpen(false);
      setForm({
        asset_id: defaultAssetId?.toString() || "",
        type: "buy",
        quantity: "",
        price: "",
        fee: "0",
        date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus size={16} className="mr-2" />
        Nueva Transaccion
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Transaccion</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Activo</Label>
            <Select
              value={form.asset_id}
              onValueChange={(v) => {
                if (!v) return;
                const selected = assets.find((a) => a.id.toString() === v);
                setForm({
                  ...form,
                  asset_id: v,
                  price: selected?.current_price
                    ? (selected.current_price / 100).toString()
                    : form.price,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar activo" />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.symbol} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                {Object.entries(TRANSACTION_TYPES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {["interest", "dividend"].includes(form.type) ? (
            <div className="space-y-2">
              <Label>Monto ganado ({currency})</Label>
              <Input
                type="number"
                step="any"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="250"
                required
              />
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
                <Label>Precio por unidad ({currency})</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="67500"
                  required
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fee (USD)</Label>
              <Input
                type="number"
                step="any"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
              />
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
          </div>

          {(["interest", "dividend"].includes(form.type) ? form.price : form.quantity && form.price) && (
            <div className="rounded-md bg-muted p-3 text-sm">
              Total:{" "}
              <span className="font-mono font-medium">
                $
                {["interest", "dividend"].includes(form.type)
                  ? parseFloat(form.price || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })
                  : (parseFloat(form.quantity) * parseFloat(form.price)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
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
            <Button type="submit" disabled={loading || !form.asset_id}>
              {loading ? "Guardando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
