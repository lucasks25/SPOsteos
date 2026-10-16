import { ActionButton } from "@/components/form";
import { Badge, Card, StatusBadge, Td } from "@/components/ui";
import { db } from "@/lib/db";
import { date, inputDate, money, toNumber } from "@/lib/format";
import { hojeUTC } from "@/lib/datas";
import { statusEfetivo, type ResultadoRisco } from "../../_lib/autorizacao";
import { PainelAchados } from "../../_lib/autorizacao-view";
import { sugerirItensGuia } from "../../_lib/autorizacao-servico";
import { excluirAutorizacao } from "../autorizacao-actions";
import { AutorizacaoForm } from "./autorizacao-form";

/** Cartão "Autorização do convênio": guias, itens solicitados/autorizados e painel de risco de glosa. */
export async function AutorizacaoCard({
  cirurgiaId,
  dataHora,
  convenio,
  risco,
  podeEditar,
}: {
  cirurgiaId: string;
  dataHora: Date;
  convenio: { nome: string; exigeAutorizacao: boolean } | null;
  risco: ResultadoRisco;
  podeEditar: boolean;
}) {
  const [guias, produtos] = await Promise.all([
    db.autorizacaoConvenio.findMany({
      where: { cirurgiaId },
      orderBy: { criadoEm: "asc" },
      include: { itens: { include: { produto: { select: { codigo: true, descricao: true } } }, orderBy: { produto: { descricao: "asc" } } } },
    }),
    podeEditar ? db.produto.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricao: true }, orderBy: { descricao: "asc" } }) : Promise.resolve([]),
  ]);
  const sugestao = podeEditar ? await sugerirItensGuia(cirurgiaId) : [];
  const hoje = inputDate(hojeUTC());

  return (
    <Card title="Autorização do convênio" actions={convenio ? <Badge color={convenio.exigeAutorizacao ? "teal" : "gray"}>{convenio.exigeAutorizacao ? "exige autorização" : "não exige autorização"}</Badge> : undefined}>
      {!convenio ? (
        <p className="text-sm text-slate-600">Cirurgia sem convênio (particular ou SUS): não há autorização prévia a verificar.</p>
      ) : (
        <div className="space-y-4">
          {!convenio.exigeAutorizacao && (
            <p className="text-sm text-slate-600">O convênio {convenio.nome} está marcado como não exigindo autorização; a verificação de risco de glosa fica desligada. Dá para registrar a guia mesmo assim.</p>
          )}
          <PainelAchados risco={risco} />

          {guias.length === 0 && convenio.exigeAutorizacao && <p className="text-sm text-slate-600">Nenhuma guia registrada para esta cirurgia.</p>}
          {guias.map((g) => {
            const efetivo = statusEfetivo(g, dataHora);
            return (
              <div key={g.id} className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-semibold">Guia {g.numeroGuia ?? "sem número"}</span>
                    <StatusBadge status={efetivo} />
                    {efetivo !== g.status && <span className="text-xs text-rose-600">validade vencida antes da cirurgia</span>}
                    {g.senha && <span className="text-xs text-slate-600">senha {g.senha}</span>}
                    <span className="text-xs text-slate-600">solicitada em {date(g.solicitadaEm)}</span>
                    {g.autorizadaEm && <span className="text-xs text-slate-600">autorizada em {date(g.autorizadaEm)}</span>}
                    {g.validade && <span className="text-xs text-slate-600">válida até {date(g.validade)}</span>}
                  </div>
                  {podeEditar && (
                    <ActionButton action={excluirAutorizacao.bind(null, g.id)} variant="small" confirm="Excluir esta guia e seus itens?">
                      Excluir
                    </ActionButton>
                  )}
                </div>
                {g.observacao && <p className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-600">{g.observacao}</p>}
                {g.itens.length > 0 ? (
                  <div className="tabela-rolagem">
                    {/* mesmo padrão visual do Table (ui.tsx), sem o cartão: já está dentro da caixa da guia */}
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th scope="col" className="h-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500 first:pl-4 last:pr-4 text-left">Produto</th>
                          <th scope="col" className="h-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500 first:pl-4 last:pr-4 text-right">Solicitado</th>
                          <th scope="col" className="h-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500 first:pl-4 last:pr-4 text-right">Autorizado</th>
                          <th scope="col" className="h-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-slate-500 first:pl-4 last:pr-4 text-right">Valor autorizado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 [&>tr]:h-10">
                        {g.itens.map((i) => (
                          <tr key={i.id}>
                            <Td className="whitespace-normal">
                              {i.produto.descricao} <span className="font-mono text-xs text-slate-500">{i.produto.codigo}</span>
                            </Td>
                            <Td className="tnum text-right">{i.quantidadeSolicitada}</Td>
                            <Td className="tnum text-right font-semibold">{i.quantidadeAutorizada}</Td>
                            <Td className="tnum text-right">{i.valorAutorizado ? money(toNumber(i.valorAutorizado)) : "—"}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-3 py-2 text-xs text-slate-600">Guia sem itens.</p>
                )}
                {podeEditar && (
                  <details className="border-t border-slate-200 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-teal-700">Editar guia</summary>
                    <div className="pt-3">
                      <AutorizacaoForm
                        cirurgiaId={cirurgiaId}
                        produtos={produtos}
                        sugestao={[]}
                        hoje={hoje}
                        guia={{
                          id: g.id,
                          numeroGuia: g.numeroGuia ?? "",
                          senha: g.senha ?? "",
                          status: g.status,
                          solicitadaEm: inputDate(g.solicitadaEm),
                          autorizadaEm: g.autorizadaEm ? inputDate(g.autorizadaEm) : "",
                          validade: g.validade ? inputDate(g.validade) : "",
                          observacao: g.observacao ?? "",
                          itens: g.itens.map((i) => ({ produtoId: i.produtoId, quantidadeSolicitada: i.quantidadeSolicitada, quantidadeAutorizada: i.quantidadeAutorizada, valorAutorizado: i.valorAutorizado ? toNumber(i.valorAutorizado) : null })),
                        }}
                      />
                    </div>
                  </details>
                )}
              </div>
            );
          })}

          {podeEditar && (
            <details className="rounded-xl border border-slate-200 px-3 py-2" open={guias.length === 0 && convenio.exigeAutorizacao}>
              <summary className="cursor-pointer text-sm font-medium text-teal-700">Registrar guia / autorização</summary>
              <p className="my-2 text-xs text-slate-600">Os itens vêm pré-preenchidos com os materiais do procedimento (ou do consumo, se não houver). Ajuste o que foi pedido ao convênio.</p>
              <AutorizacaoForm cirurgiaId={cirurgiaId} produtos={produtos} sugestao={sugestao} hoje={hoje} />
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
