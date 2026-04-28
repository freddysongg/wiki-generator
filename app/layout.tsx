import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { BatchProvider } from "@/components/batch-context";
import type { ReactNode, JSX } from "react";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "wiki-gen",
  description: "Local PDF → Markdown wiki generator",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-bg text-fg antialiased">
        <BatchProvider>
          <AppShell>{children}</AppShell>
        </BatchProvider>
        <Toaster />
      </body>
    </html>
  );
}
