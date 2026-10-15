import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestão OPME",
  description: "Sistema de gestão de órteses, próteses e materiais especiais",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // tema escolhido pelo usuário (cookie); sem escolha, segue o sistema operacional pelo CSS
  const tema = (await cookies()).get("opme_tema")?.value;
  return (
    <html lang="pt-BR" data-theme={tema === "escuro" ? "dark" : tema === "claro" ? "light" : undefined}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
