"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface BalanceCtx {
  hidden: boolean;
  toggle: () => void;
}

const Ctx = createContext<BalanceCtx>({ hidden: false, toggle: () => {} });

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("hideBalance") === "1") {
      setHidden(true);
    }
  }, []);

  function toggle() {
    setHidden((h) => {
      const next = !h;
      if (typeof window !== "undefined") {
        localStorage.setItem("hideBalance", next ? "1" : "0");
      }
      return next;
    });
  }

  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

export function useBalance() {
  return useContext(Ctx);
}

/** Mask a formatted money string when balances are hidden. */
export function mask(value: string, hidden: boolean): string {
  return hidden ? "••••••" : value;
}
