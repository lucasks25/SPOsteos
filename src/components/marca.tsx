import "server-only";
import fs from "node:fs";
import path from "node:path";
import { empresa, linhasEmpresa } from "@/lib/empresa";

/**
 * Marca da empresa. Sem arquivo de logo, mostra o nome em texto com o monograma "SPO".
 * Quando existir public/marca/logo.svg (ou .png) passa a usar a imagem sozinha; se existir também
 * logo-escuro.svg (ou .png), ela é usada no tema escuro e nas faixas escuras (login). Ver docs/MARCA.md.
 * A detecção é feita no servidor, uma vez por processo (reinicie/rebuild após colocar o arquivo).
 */
type Logos = { claro: string | null; escuro: string | null };
let cache: Logos | null = null;

function achar(base: string): string | null {
  for (const ext of ["svg", "png"]) {
    if (fs.existsSync(path.join(process.cwd(), "public", "marca", `${base}.${ext}`))) return `/marca/${base}.${ext}`;
  }
  return null;
}

function logos(): Logos {
  if (!cache || process.env.NODE_ENV !== "production") cache = { claro: achar("logo"), escuro: achar("logo-escuro") };
  return cache;
}

export type VarianteMarca = "topo" | "login" | "impresso";

const ALTURA: Record<VarianteMarca, string> = { topo: "h-8", login: "h-10", impresso: "h-12" };

export function Marca({ variante = "topo", sobreEscuro = false }: { variante?: VarianteMarca; sobreEscuro?: boolean }) {
  const { nome } = empresa();
  const { claro, escuro } = logos();
  const h = ALTURA[variante];

  if (claro || escuro) {
    // imagem clara para fundo claro; a escura para tema escuro ou faixa escura. Sem a escura, repete a clara.
    const imgClaro = claro ?? escuro!;
    const imgEscuro = escuro ?? claro!;
    if (sobreEscuro) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={imgEscuro} alt={nome} className={`${h} w-auto`} />;
    }
    return (
      <span className="inline-flex items-center">
        <style>{`:root[data-theme="dark"] .marca-claro{display:none}:root:not([data-theme="dark"]) .marca-escuro{display:none}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .marca-claro{display:none}:root:not([data-theme="light"]) .marca-escuro{display:inline}}`}</style>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgClaro} alt={nome} className={`marca-claro ${h} w-auto`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgEscuro} alt="" aria-hidden="true" className={`marca-escuro ${h} w-auto`} />
      </span>
    );
  }

  const quadrado = variante === "topo" ? "h-9 w-9 rounded-xl text-[11px]" : variante === "login" ? "h-11 w-11 rounded-xl text-sm" : "h-11 w-11 rounded text-sm";
  // sobre faixa escura (menu lateral, login): monograma menta com texto escuro; impresso: preto e branco
  const cor = sobreEscuro ? "bg-sidebar-destaque text-sidebar" : variante === "impresso" ? "bg-slate-900 text-white print:bg-black" : "bg-primary text-on-primary";
  const texto = variante === "topo" ? "text-[0.9375rem] font-extrabold" : variante === "login" ? "text-xl font-extrabold" : "text-lg font-bold";
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span className={`flex shrink-0 items-center justify-center font-display font-extrabold tracking-tight ${quadrado} ${cor}`} aria-hidden="true">
        SPO
      </span>
      <span className={`marca-nome truncate font-display tracking-tight ${texto} ${sobreEscuro ? "text-sidebar-fg-ativo" : "text-slate-900"}`}>{nome}</span>
    </span>
  );
}

/** Cabeçalho dos documentos impressos: marca + dados cadastrais da empresa (um lugar só: src/lib/empresa.ts). */
export function CabecalhoImpresso({ titulo, children }: { titulo?: string; children?: React.ReactNode }) {
  const linhas = linhasEmpresa();
  return (
    <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-300 pb-3">
      <div>
        <Marca variante="impresso" />
        {linhas.length > 0 && (
          <div className="mt-1 text-[11px] leading-snug text-slate-600">
            {linhas.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        )}
      </div>
      {(titulo || children) && (
        <div className="text-right">
          {titulo && <p className="text-base font-bold text-slate-900">{titulo}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
