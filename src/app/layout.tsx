import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
// protótipo do visual clássico (só age com data-visual="classico" no <html>; ver o próprio arquivo)
import "./estilos/classico.css";

// fontes livres (OFL) auto-hospedadas pelo next/font: Inter no corpo e nas tabelas, Manrope nos títulos e números de destaque;
// o CSS cai na fonte do sistema se elas não carregarem
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "SP OSTEOS · Gestão",
  description: "Sistema de gestão de órteses, próteses e materiais especiais",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // tema escolhido pelo usuário (cookie); sem escolha, segue o sistema operacional pelo CSS
  const store = await cookies();
  const tema = store.get("opme_tema")?.value;
  // protótipo do visual clássico (estilos/classico.css), ligado no Painel
  const classico = store.get("opme_visual")?.value === "classico";
  return (
    <html lang="pt-BR" className={`${inter.variable} ${manrope.variable}`} data-theme={tema === "escuro" ? "dark" : tema === "claro" ? "light" : undefined} data-visual={classico ? "classico" : undefined}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
