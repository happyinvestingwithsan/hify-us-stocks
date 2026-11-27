import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HIFY Tracker · US Stocks",
  description: "INDmoney US Equities Lot-Level Journal, Exact Profit & GTT Engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="min-h-screen bg-[var(--bg)] text-[var(--text-main)] flex flex-col">
        {children}
      </body>
    </html>
  );
}
