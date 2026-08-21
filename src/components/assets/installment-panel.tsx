"use client";

import { Lock } from "lucide-react";
import { installmentStats } from "@/lib/portfolio";
import { centsToUsd, formatMoney } from "@/lib/formatters";
import { useBalance, mask } from "@/components/home/balance-context";
import type { AssetWithValue, Transaction } from "@/types";

interface Props {
  asset: AssetWithValue;
  transactions: Transaction[];
}

function rateLabel(rate: number) {
  return `$${rate.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

/**
 * One "ARS · USD" money pair, the shape this whole screen is built around.
 * `usd` is optional: what's still owed is owed in pesos, and pricing it in
 * dollars today would be a guess at the rate you'll pay it with.
 */
function Pair({
  label,
  native,
  usd,
  currency,
  hidden,
  note,
  strong,
}: {
  label: string;
  native: number;
  usd?: number;
  currency: "USD" | "ARS";
  hidden: boolean;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className={strong ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span className="flex items-baseline gap-2 font-mono">
        <span className={strong ? "font-semibold" : "text-muted-foreground"}>
          {mask(formatMoney(native, currency), hidden)}
        </span>
        {usd != null && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className={strong ? "font-semibold text-primary" : "text-muted-foreground"}>
              {mask(centsToUsd(usd), hidden)}
            </span>
          </>
        )}
        {note && <span className="text-xs font-sans text-muted-foreground">{note}</span>}
      </span>
    </div>
  );
}

export function InstallmentPanel({ asset, transactions }: Props) {
  const { hidden } = useBalance();
  const s = installmentStats(asset, transactions);
  const currency = asset.currency;
  const expensesCount = transactions.filter((t) => t.type === "gasto").length;

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Progreso</span>
          <span className="font-mono text-muted-foreground">
            {s.installmentsTotal > 0
              ? `${s.installmentsPaid} / ${s.installmentsTotal} cuotas`
              : `${s.installmentsPaid} cuotas`}
            <span className="ml-2 text-primary">{s.progressPct.toFixed(1)}%</span>
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, s.progressPct))}%` }}
          />
        </div>
      </div>

      {/* What it has cost so far — the question this screen exists to answer. */}
      <div className="space-y-2.5 rounded-lg border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
          <Lock size={12} />
          Llevás pagado
        </div>
        <Pair
          label="Total desembolsado"
          native={s.totalPaidNative}
          usd={s.totalPaidUsd}
          currency={currency}
          hidden={hidden}
          strong
        />
        <div className="space-y-1.5 border-t border-border/60 pt-2.5">
          <Pair
            label={`Cuotas (${s.installmentsPaid})`}
            native={s.paidNative}
            usd={s.paidUsd}
            currency={currency}
            hidden={hidden}
          />
          {expensesCount > 0 && (
            <Pair
              label={`Gastos administrativos (${expensesCount})`}
              native={s.expensesNative}
              usd={s.expensesUsd}
              currency={currency}
              hidden={hidden}
            />
          )}
        </div>
        {s.avgFxRate && (
          <p className="border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
            Cotización promedio pagada:{" "}
            <span className="font-mono text-foreground">{rateLabel(s.avgFxRate)}</span> por dólar. El
            USD de cada pago quedó congelado el día que lo cargaste, así que este total no cambia.
          </p>
        )}
      </div>

      {/* What's left, and the deal itself — in pesos, which is how it's owed. */}
      <div className="space-y-2.5">
        <Pair
          label="Resta pagar"
          native={s.remainingNative}
          currency={currency}
          hidden={hidden}
          strong
        />
        <Pair
          label="Precio total pactado"
          native={asset.purchase_total}
          currency={currency}
          hidden={hidden}
        />
      </div>

      <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
        Este seguimiento no suma ni resta al patrimonio, a la deuda ni a la ganancia. Es solo el
        registro de las cuotas que vas pagando.
      </p>
    </div>
  );
}
