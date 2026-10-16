import Link from "next/link";
import type { Perfil } from "@/generated/prisma/client";
import { date } from "@/lib/format";
import { hojeUTC } from "@/app/(app)/financeiro/_lib/datas";
import { Badge, btn, Card, LinkButton } from "@/components/ui";
import { COR_SITUACAO, CAMPO_FK, piorSituacao, podeEditarDocumentos, podeVerDocumentos, ROTULO_TIPO, type EscopoDoc } from "../_lib/documentos";
import { documentosDoCadastro } from "../_lib/documentos-servico";
import { SituacaoBadge } from "../_lib/situacao-badge";

/** Cartão "Documentos" dos cadastros de fornecedor, fabricante e produto: situação, lista e botão de incluir. */
export async function DocumentosCard({ escopo, id, perfil }: { escopo: Exclude<EscopoDoc, "EMPRESA">; id: string; perfil: Perfil }) {
  if (!podeVerDocumentos(perfil)) return null;
  const hoje = hojeUTC();
  const docs = await documentosDoCadastro(escopo, id);
  const pior = piorSituacao(docs.map((d) => d.validade), hoje);
  const novo = `/qualidade/documentos/novo?escopo=${escopo}&${CAMPO_FK[escopo]}=${id}`;
  return (
    <Card
      title="Documentos"
      icon="escudo"
      className="mt-4"
      actions={
        <span className="flex items-center gap-2">
          {pior && <Badge color={COR_SITUACAO[pior]}>{docs.length} documento(s) · pior situação: {textoSituacaoResumo(pior)}</Badge>}
          {podeEditarDocumentos(perfil) && <LinkButton href={novo} variant="secondary" icon="mais">Incluir</LinkButton>}
        </span>
      }
    >
      {docs.length === 0 ? (
        <p className="text-sm text-slate-600">Nenhum documento cadastrado para este {escopo === "PRODUTO" ? "produto" : escopo === "FORNECEDOR" ? "fornecedor" : "fabricante"}.</p>
      ) : (
        <ul className="divide-y divide-slate-200 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <Link href={`/qualidade/documentos/${d.id}`} className="font-medium text-teal-700 hover:underline">{d.titulo}</Link>
                <span className="block text-xs text-slate-500">{ROTULO_TIPO[d.tipo]}{d.numero ? ` · nº ${d.numero}` : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-600">{d.validade ? `validade ${date(d.validade)}` : "sem vencimento"}</span>
                <SituacaoBadge validade={d.validade} hoje={hoje} />
                <Link href={`/qualidade/documentos/${d.id}`} className={btn.small}>Abrir</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function textoSituacaoResumo(s: NonNullable<ReturnType<typeof piorSituacao>>) {
  return { VENCIDO: "vencido", VENCE_EM_30: "vence em 30 dias", VENCE_EM_90: "vence em 90 dias", VIGENTE: "vigente", SEM_VENCIMENTO: "sem vencimento" }[s];
}
