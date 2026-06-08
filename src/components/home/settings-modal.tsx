"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Link2, Loader2, RefreshCw, History, LogOut } from "lucide-react";

interface BingxStatus {
  configured: boolean;
  api_key_preview: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}

export function SettingsModal({ open, onOpenChange, onChanged }: Props) {
  const [status, setStatus] = useState<BingxStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/settings/bingx");
    const json = await res.json();
    setStatus(json.data);
  }

  async function loadAuth() {
    try {
      const res = await fetch("/api/auth/login");
      const json = await res.json();
      setAuthEnabled(!!json.enabled);
    } catch {
      setAuthEnabled(false);
    }
  }

  useEffect(() => {
    if (open) {
      setMessage(null);
      loadStatus();
      loadAuth();
    }
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/bingx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: typeof json.error === "string" ? json.error : "Error" });
        return;
      }
      setMessage({
        type: "ok",
        text: `Conectado. Equity: $${json.data.equity?.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      });
      setApiKey("");
      setApiSecret("");
      await loadStatus();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/prices/bingx", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: typeof json.error === "string" ? json.error : "Error" });
        return;
      }
      setMessage({ type: "ok", text: `Equity sincronizado: $${json.data.equity?.toLocaleString("en-US", { minimumFractionDigits: 2 })}` });
      onChanged();
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!confirm("¿Desconectar BingX y borrar las API keys?")) return;
    await fetch("/api/settings/bingx", { method: "DELETE" });
    setMessage(null);
    await loadStatus();
  }

  async function rebuild() {
    setRebuilding(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portfolio/rebuild", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: typeof json.error === "string" ? json.error : "Error" });
        return;
      }
      setMessage({ type: "ok", text: `Historial reconstruido (${json.data.days} días).` });
      onChanged();
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={18} /> Ajustes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Conexión BingX (Copytrading)</h3>
            {status?.configured ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 size={16} />
                Conectado · {status.api_key_preview}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Conectá tu cuenta de futuros (equity de copytrading). Usá API keys de
                <strong> solo lectura</strong>.
              </p>
            )}

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>API Secret</Label>
              <Input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="API Secret" autoComplete="off" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={save} disabled={saving || !apiKey || !apiSecret}>
                {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
                {status?.configured ? "Actualizar keys" : "Conectar"}
              </Button>
              {status?.configured && (
                <>
                  <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
                    <RefreshCw size={14} className={syncing ? "mr-2 animate-spin" : "mr-2"} />
                    Sincronizar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={disconnect} className="text-red-400">
                    Desconectar
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <h3 className="text-sm font-medium">Historial</h3>
            <p className="text-xs text-muted-foreground">
              Reconstruye la curva histórica desde tus compras (cripto con precios reales).
            </p>
            <Button size="sm" variant="outline" onClick={rebuild} disabled={rebuilding}>
              <History size={14} className={rebuilding ? "mr-2 animate-spin" : "mr-2"} />
              Reconstruir historial
            </Button>
          </div>

          {message && (
            <p className={message.type === "ok" ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
              {message.text}
            </p>
          )}

          {authEnabled && (
            <div className="border-t border-border pt-4">
              <Button size="sm" variant="ghost" onClick={logout} className="text-muted-foreground">
                <LogOut size={14} className="mr-2" />
                Cerrar sesión
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
