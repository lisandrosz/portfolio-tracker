import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { BalanceProvider } from "@/components/home/balance-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mi Portfolio",
  description: "Seguimiento de inversiones",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <BalanceProvider>
          <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</main>
        </BalanceProvider>
      </body>
    </html>
  );
}
