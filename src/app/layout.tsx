import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// fonte livre (OFL) auto-hospedada pelo next/font; o globals.css cai na fonte do sistema se ela não carregar
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "SP OSTEOS · Gestão",
  description: "Sistema de gestão de órteses, próteses e materiais especiais",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // tema escolhido pelo usuário (cookie); sem escolha, segue o sistema operacional pelo CSS
  const tema = (await cookies()).get("opme_tema")?.value;
  return (
    <html lang="pt-BR" className={inter.variable} data-theme={tema === "escuro" ? "dark" : tema === "claro" ? "light" : undefined}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
