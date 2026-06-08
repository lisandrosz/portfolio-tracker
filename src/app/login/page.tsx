"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Full reload so the middleware re-evaluates with the new cookie.
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "No se pudo iniciar sesión");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl border border-border bg-card/40 p-8 shadow-2xl"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Lock size={22} />
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-lg font-semibold">Mi Portfolio</h1>
          <p className="text-sm text-muted-foreground">Ingresá tu contraseña para continuar</p>
        </div>

        <div className="w-full">
          <Input
            type="password"
            autoFocus
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
          />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading || !password}>
          {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
