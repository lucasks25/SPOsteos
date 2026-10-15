import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Gestão OPME",
  description: "Sistema de gestão de órteses, próteses e materiais especiais",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={figtree.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
