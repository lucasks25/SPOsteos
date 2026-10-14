import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestão OPME",
  description: "Sistema de gestão de órteses, próteses e materiais especiais",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
