import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionButton } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { btn } from "@/components/ui";
import { date, dateTime, num } from "@/lib/format";
import { PERFIS_RECOLHER, ROTULO_CLASSE, ROTULO_ORIGEM, docRecolhimento, encerrado, podeOperarRecolhimento } from "../../../../_lib/recolhimento";
import { situacaoAlvos } from "../../../../_lib/recolhimento-servico";
import { comunicarHospitalAction } from "../../../actions";

/** Comunicado de recolhimento para um hospital: impressão em preto e branco, com campo de assinatura do recebimento. */
export default async function ComunicadoPage({ params }: { params: Promise<{ id: string; localId: string }> }) {
  const user = await requireUser(PERFIS_RECOLHER);
  const p = await params;
  const id = Number(p.id);
  if (!Number.isInteger(id)) notFound();
  const sit = await situacaoAlvos(db, id).catch(() => null);
  if (!sit) notFound();
  const { rec } = sit;
  const itens = sit.itens.filter((i) => i.localId === p.localId);
  const local = itens[0]?.local;
  if (!local || local.tipo !== "HOSPITAL" || !local.hospital) notFound();
  const h = local.hospital;
  // cirurgias deste hospital com o lote (sem nome do paciente: o hospital identifica pelo número e pela data)
  const usos = await db.recolhimentoPaciente.findMany({
    where: { recolhimentoId: id, cirurgia: { hospitalId: h.id } },
    include: { lote: { select: { numero: true } }, cirurgia: { select: { numero: true, dataHora: true } } },
    orderBy: { cirurgia: { dataHora: "asc" } },
  });
  const total = itens.reduce((v, i) => v + i.saldoAtual, 0);
  const pendente = itens.some((i) => i.status === "PENDENTE");
  const doc = docRecolhimento(id);
  const th = "border border-black px-2 py-1 text-left text-[11px] font-bold uppercase";
  const td = "border border-black px-2 py-1 align-top";

  return (
    <div className="mx-auto max-w-4xl text-black">
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/qualidade/recolhimentos/${id}?aba=locais`} className={btn.ghost}>Voltar</Link>
        <PrintButton label="Imprimir comunicado" />
        {podeOperarRecolhimento(user.perfil) && !encerrado(rec.status) && pendente && (
          <ActionButton action={comunicarHospitalAction} hidden={{ id, localId: p.localId }} variant="primary" confirm="Registrar que este comunicado foi enviado ao hospital?">
            Registrar como comunicado
          </ActionButton>
        )}
        {!pendente && itens.some((i) => i.comunicadoEm) && <span className="text-xs text-slate-600">Comunicado registrado em {dateTime(itens.find((i) => i.comunicadoEm)?.comunicadoEm)}</span>}
      </div>

      <article className="space-y-4 border border-slate-300 bg-white p-6 text-[13px] print:border-0 print:p-0">
        <header className="border-b-2 border-black pb-2">
          <h1 className="text-lg font-bold uppercase">Comunicado de recolhimento de produto</h1>
          <p>Documento {doc} · emitido em {dateTime(new Date())}</p>
        </header>

        <section>
          <h2 className="font-bold uppercase">Destinatário</h2>
          <p>{h.razaoSocial}{h.nomeFantasia ? ` (${h.nomeFantasia})` : ""} · CNPJ {h.cnpj}</p>
          <p>{[h.endereco, h.cidade, h.uf].filter(Boolean).join(" — ") || "Endereço não cadastrado"}</p>
        </section>

        <section>
          <h2 className="font-bold uppercase">Ação de campo</h2>
          <p><strong>Origem:</strong> {ROTULO_ORIGEM[rec.origem]}{rec.referencia ? ` · ref. ${rec.referencia}` : ""} · <strong>{ROTULO_CLASSE[rec.classe]}</strong></p>
          {rec.prazo && <p><strong>Prazo para a retirada:</strong> {date(rec.prazo)}</p>}
          <p className="mt-1"><strong>Motivo:</strong> {rec.motivo}</p>
        </section>

        <section>
          <h2 className="mb-1 font-bold uppercase">Produtos e lotes afetados neste hospital</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr><th className={th}>Produto</th><th className={th}>Reg. ANVISA</th><th className={th}>Lote</th><th className={th}>Validade</th><th className={`${th} text-right`}>Qtd. consignada</th></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td className={td}>{i.lote.produto.descricao}<div className="font-mono text-[11px]">{i.lote.produto.codigo}</div></td>
                  <td className={td}>{i.lote.produto.registroAnvisa ?? "—"}</td>
                  <td className={`${td} font-mono`}>{i.lote.numero}</td>
                  <td className={td}>{date(i.lote.validade)}</td>
                  <td className={`${td} text-right tabular-nums`}>{num(i.saldoAtual)}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className={`${td} text-right font-bold`}>Total</td><td className={`${td} text-right font-bold tabular-nums`}>{num(total)}</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="font-bold uppercase">Instruções</h2>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>Suspender imediatamente o uso das unidades dos lotes acima.</li>
            <li>Segregar o material em local identificado como &quot;recolhimento — não usar&quot;.</li>
            <li>Conferir a quantidade em estoque e anotar abaixo; informar qualquer diferença em relação a este comunicado.</li>
            <li>Se alguma unidade já foi usada em paciente, informar a data do procedimento e o médico responsável ao nosso setor de qualidade.</li>
            <li>Aguardar a retirada pela distribuidora ou devolver o material com este comunicado.</li>
          </ol>
        </section>

        {usos.length > 0 && (
          <section>
            <h2 className="mb-1 font-bold uppercase">Procedimentos neste hospital em que o lote foi usado</h2>
            <table className="w-full border-collapse text-[12px]">
              <thead><tr><th className={th}>Cirurgia</th><th className={th}>Data</th><th className={th}>Lote</th><th className={`${th} text-right`}>Qtd.</th></tr></thead>
              <tbody>
                {usos.map((u) => <tr key={u.id}><td className={td}>CIR-{u.cirurgia.numero}</td><td className={td}>{date(u.cirurgia.dataHora)}</td><td className={`${td} font-mono`}>{u.lote.numero}</td><td className={`${td} text-right`}>{u.quantidade}</td></tr>)}
              </tbody>
            </table>
          </section>
        )}

        <section className="space-y-6 pt-2">
          <h2 className="font-bold uppercase">Recebimento do comunicado</h2>
          <p>Quantidade conferida no hospital: ____________ unidades.   Observações: ______________________________________________</p>
          <div className="grid grid-cols-2 gap-8 pt-6">
            <div className="border-t border-black pt-1">Nome e cargo do responsável</div>
            <div className="border-t border-black pt-1">Assinatura e data do recebimento</div>
          </div>
        </section>
      </article>
    </div>
  );
}
