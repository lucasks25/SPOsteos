import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "./base";

/**
 * Tabela de lista no padrão do ERPNext/Odoo: barra com título e contagem, cabeçalho cinza fixo ao rolar,
 * linhas de 32 px sem zebra, hover cinza; número com `text-right` (o cabeçalho acompanha sozinho).
 * - `rodape`: uma ou mais <tr> de totais, no <tfoot> (fundo cinza, negrito).
 * - `paginacao`: faixa no pé do cartão (use <Paginacao/>).
 * - `relatorio`: sem altura máxima e com a primeira coluna fixa (tabelas largas por período, como o DRE).
 * Linha clicável inteira: use <Celula href> (ou a classe `link-linha` num link) na primeira coluna.
 * `head` aceita texto ou { label, className?, hideOnMobile? }: `hideOnMobile` esconde a coluna inteira (th e td)
 * abaixo de 768 px, para listas largas não rolarem no celular; `className` vai só no <th>.
 */
export type Coluna = ReactNode | { label: ReactNode; className?: string; hideOnMobile?: boolean };
function ehColuna(h: Coluna): h is { label: ReactNode; className?: string; hideOnMobile?: boolean } {
  return typeof h === "object" && h !== null && !isValidElement(h) && !Array.isArray(h) && "label" in h;
}

export function Table({
  head,
  children,
  empty,
  emptyText,
  emptyAction,
  titulo,
  contagem,
  acoes,
  rodape,
  paginacao,
  relatorio,
}: {
  head: Coluna[];
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  /** barra da tabela: título com a contagem à esquerda e ações à direita */
  titulo?: string;
  /** mantido por compatibilidade; a barra da tabela não mostra ícone */
  icone?: IconName;
  contagem?: number;
  acoes?: ReactNode;
  rodape?: ReactNode;
  paginacao?: ReactNode;
  /** relatório (DRE, fluxo): sem rolagem interna (a página rola inteira, nenhuma linha fica escondida) e 1ª coluna fixa ao rolar na horizontal */
  relatorio?: boolean;
}) {
  const cols = head.map((h) => (ehColuna(h) ? h : { label: h }));
  const ocultar = cols.flatMap((c, i) => (c.hideOnMobile ? [String(i + 1)] : [])).join(" ");
  return (
    <div className="tabela overflow-hidden rounded-xl border border-slate-200 bg-white print:overflow-visible">
      {(titulo || contagem !== undefined || acoes) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-1.5">
          <h2 className="flex min-w-0 items-baseline gap-2 text-[0.9375rem] font-semibold text-slate-900">
            {titulo && <span className="truncate">{titulo}</span>}
            {contagem !== undefined && (
              <span className="tnum shrink-0 text-sm font-normal text-slate-500">
                {titulo ? contagem : `${contagem} ${contagem === 1 ? "item" : "itens"}`}
              </span>
            )}
          </h2>
          {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
        </div>
      )}
      <div className="tabela-rolagem" data-relatorio={relatorio || undefined}>
        <table className="min-w-full text-sm" data-ocultar={ocultar || undefined}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i} scope="col" className={cx("h-8 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-left text-xs font-semibold text-slate-600 first:pl-4 last:pr-4", c.className)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:h-8 [&>tr]:border-b [&>tr]:border-slate-100 [&>tr:last-child]:border-b-0 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50">{!empty && children}</tbody>
          {rodape && !empty && <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold [&>tr]:h-8">{rodape}</tfoot>}
        </table>
        {/* fora da tabela: ocupa a largura do cartão, não a da tabela (no celular a tabela é mais larga que a tela) */}
        {empty && (
          <div className="px-4 py-8">
            <EmptyState text={emptyText ?? "Nenhum registro encontrado."} action={emptyAction} />
          </div>
        )}
      </div>
      {paginacao && <div className="border-t border-slate-200 px-4 py-2 print:hidden">{paginacao}</div>}
    </div>
  );
}

export function Td({ children, className, title, colSpan }: { children?: ReactNode; className?: string; title?: string; colSpan?: number }) {
  return (
    <td title={title} colSpan={colSpan} className={cx("whitespace-nowrap px-3 py-1 align-middle text-slate-900 first:pl-4 last:pr-4", className)}>
      {children}
    </td>
  );
}

/**
 * Paginação compacta para o pé da tabela: "1–50 de 312" e setas anterior/próxima.
 * `hrefPagina` monta o link de cada página (mantendo os filtros da URL).
 */
export function Paginacao({ pagina, porPagina, total, hrefPagina }: { pagina: number; porPagina: number; total: number; hrefPagina: (p: number) => string }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const ini = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const fim = Math.min(total, pagina * porPagina);
  const seta = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50";
  const off = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-300";
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
      <span className="tnum">
        {ini}–{fim} de {total}
      </span>
      {pagina > 1 ? (
        <Link href={hrefPagina(pagina - 1)} aria-label="Página anterior" className={seta}>
          <Icon name="direita" size={14} className="rotate-180" />
        </Link>
      ) : (
        <span className={off} aria-hidden="true"><Icon name="direita" size={14} className="rotate-180" /></span>
      )}
      {pagina < paginas ? (
        <Link href={hrefPagina(pagina + 1)} aria-label="Próxima página" className={seta}>
          <Icon name="direita" size={14} />
        </Link>
      ) : (
        <span className={off} aria-hidden="true"><Icon name="direita" size={14} /></span>
      )}
    </div>
  );
}

/** Estado vazio: ícone cinza discreto, por que está vazio e, se houver, a ação que resolve. */
export function EmptyState({ text, action, icon = "caixa", titulo }: { text: string; action?: ReactNode; icon?: IconName; titulo?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Icon name={icon} size={28} className="text-slate-400" aria-hidden="true" />
      <div className="max-w-sm">
        {titulo && <p className="text-sm font-semibold text-slate-900">{titulo}</p>}
        <p className="text-sm text-slate-600">{text}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
