import Link from "next/link";
import { CabecalhoImpresso } from "@/components/marca";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { btn } from "@/components/ui";
import { date, dateTime, num } from "@/lib/format";
import { PERFIS_VER_RECOLHIMENTO, ROTULO_CLASSE, ROTULO_ORIGEM, docRecolhimento, encerrado, podeVerPacientes, resumirRecolhimento } from "../../../_lib/recolhimento";
import { situacaoAlvos } from "../../../_lib/recolhimento-servico";

/** Relatório do recolhimento (final quando concluído, parcial enquanto aberto): impressão em preto e branco. */
export default async function RelatorioRecolhimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(PERFIS_VER_RECOLHIMENTO);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const sit = await situacaoAlvos(db, id).catch(() => null);
  if (!sit) notFound();
  const { rec, itens } = sit;
  const verPac = podeVerPacientes(user.perfil);
  const [lotes, pacientes, contagemPac, acoes] = await Promise.all([
    db.recolhimentoLote.findMany({ where: { recolhimentoId: id }, include: { lote: { include: { produto: { include: { fabricante: true } } } } }, orderBy: { lote: { numero: "asc" } } }),
    // nomes de pacientes só são lidos do banco para quem pode vê-los
    verPac
      ? db.recolhimentoPaciente.findMany({
          where: { recolhimentoId: id },
          include: { lote: { select: { numero: true } }, cirurgia: { include: { hospital: true, medico: true } } },
          orderBy: { cirurgia: { dataHora: "asc" } },
        })
      : Promise.resolve([]),
    db.recolhimentoPaciente.findMany({ where: { recolhimentoId: id }, select: { comunicadoEm: true } }),
    db.recolhimentoAcao.findMany({ where: { recolhimentoId: id }, orderBy: { criadoEm: "asc" } }),
  ]);
  const r = resumirRecolhimento(itens.map((i) => i.calc), contagemPac);
  const final = rec.status === "CONCLUIDO";
  const th = "border border-black px-2 py-1 text-left text-[11px] font-bold uppercase";
  const td = "border border-black px-2 py-1 align-top";
  const nomeLocal = (i: (typeof itens)[number]) => i.local.hospital?.nomeFantasia ?? i.local.hospital?.razaoSocial ?? i.local.nome;

  return (
    <div className="mx-auto max-w-5xl text-black">
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <Link href={`/qualidade/recolhimentos/${id}`} className={btn.ghost}>Voltar</Link>
        <PrintButton label="Imprimir relatório" />
      </div>
      <article className="space-y-4 border border-slate-300 bg-white p-6 text-[13px] print:border-0 print:p-0">
        <CabecalhoImpresso />
        <header className="border-b-2 border-black pb-2">
          <h1 className="text-lg font-bold uppercase">Relatório {final ? "final" : "parcial"} de recolhimento — {docRecolhimento(id)}</h1>
          <p>Emitido em {dateTime(new Date())}{!final && ` · situação: ${rec.status.replaceAll("_", " ").toLowerCase()} (relatório sem validade final)`}</p>
        </header>

        <section>
          <h2 className="font-bold uppercase">Ação de campo</h2>
          <p><strong>Origem:</strong> {ROTULO_ORIGEM[rec.origem]}{rec.referencia ? ` · ref. ${rec.referencia}` : ""} · <strong>{ROTULO_CLASSE[rec.classe]}</strong></p>
          <p><strong>Aberto em:</strong> {dateTime(rec.abertoEm)} por {rec.abertoPor}{rec.prazo ? ` · prazo ${date(rec.prazo)}` : ""}</p>
          {rec.concluidoEm && <p><strong>Concluído em:</strong> {dateTime(rec.concluidoEm)} por {rec.concluidoPor}</p>}
          {rec.canceladoEm && <p><strong>Cancelado em:</strong> {dateTime(rec.canceladoEm)} por {rec.canceladoPor}: {rec.motivoCancelamento}</p>}
          <p className="mt-1"><strong>Motivo:</strong> {rec.motivo}</p>
        </section>

        <section>
          <h2 className="mb-1 font-bold uppercase">Resumo</h2>
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              <tr><td className={td}>Unidades encontradas na abertura</td><td className={`${td} text-right`}>{num(r.encontrado)}</td></tr>
              <tr><td className={td}>Unidades recolhidas</td><td className={`${td} text-right`}>{num(r.recolhido)}</td></tr>
              <tr><td className={td}>{final ? "Unidades não recolhidas (justificadas / consumidas / devolvidas)" : "Unidades ainda a recolher"}</td><td className={`${td} text-right`}>{num(final ? Math.max(0, r.encontrado - r.recolhido) : r.aRecolher)}</td></tr>
              <tr><td className={td}>Cirurgias com uso do lote</td><td className={`${td} text-right`}>{num(r.pacientes)}</td></tr>
              <tr><td className={td}>Pacientes/cirurgias comunicados</td><td className={`${td} text-right`}>{num(r.pacientesComunicados)} de {num(r.pacientes)}</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-1 font-bold uppercase">Lotes</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr><th className={th}>Produto</th><th className={th}>Fabricante</th><th className={th}>Reg. ANVISA</th><th className={th}>Lote</th><th className={th}>Validade</th></tr></thead>
            <tbody>{lotes.map((l) => <tr key={l.id}><td className={td}>{l.lote.produto.descricao}</td><td className={td}>{l.lote.produto.fabricante?.nome ?? "—"}</td><td className={td}>{l.lote.produto.registroAnvisa ?? "—"}</td><td className={`${td} font-mono`}>{l.lote.numero}</td><td className={td}>{date(l.lote.validade)}</td></tr>)}</tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-1 font-bold uppercase">Recolhido × encontrado, por local</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr><th className={th}>Local</th><th className={th}>Lote</th><th className={`${th} text-right`}>Encontrado</th><th className={`${th} text-right`}>Recolhido</th><th className={`${th} text-right`}>Saldo {final ? "final" : "atual"}</th><th className={th}>Situação</th><th className={th}>Comunicado</th></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td className={td}>{nomeLocal(i)}</td>
                  <td className={`${td} font-mono`}>{i.lote.numero}</td>
                  <td className={`${td} text-right`}>{num(i.saldoAbertura)}</td>
                  <td className={`${td} text-right`}>{num(i.quantidadeRecolhida)}</td>
                  <td className={`${td} text-right`}>{num(i.saldoAtual)}</td>
                  <td className={td}>{i.status.replaceAll("_", " ").toLowerCase()}{i.justificativa ? ` — ${i.justificativa}` : ""}</td>
                  <td className={td}>{i.comunicadoEm ? dateTime(i.comunicadoEm) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-1 font-bold uppercase">Pacientes / cirurgias</h2>
          {verPac ? (
            <table className="w-full border-collapse text-[12px]">
              <thead><tr><th className={th}>Cirurgia</th><th className={th}>Data</th><th className={th}>Paciente</th><th className={th}>Hospital</th><th className={th}>Médico</th><th className={th}>Lote</th><th className={th}>Comunicado</th></tr></thead>
              <tbody>
                {pacientes.length === 0 && <tr><td colSpan={7} className={td}>Nenhuma cirurgia usou os lotes.</td></tr>}
                {pacientes.map((p) => <tr key={p.id}><td className={td}>CIR-{p.cirurgia.numero}</td><td className={td}>{date(p.cirurgia.dataHora)}</td><td className={td}>{p.cirurgia.paciente}</td><td className={td}>{p.cirurgia.hospital.nomeFantasia ?? p.cirurgia.hospital.razaoSocial}</td><td className={td}>{p.cirurgia.medico.nome}</td><td className={`${td} font-mono`}>{p.lote.numero}</td><td className={td}>{p.comunicadoEm ? dateTime(p.comunicadoEm) : "pendente"}{p.observacao ? ` — ${p.observacao}` : ""}</td></tr>)}
              </tbody>
            </table>
          ) : (
            <p>{num(contagemPac.length)} cirurgia(s) usaram os lotes. Os dados de paciente são restritos (LGPD).</p>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-bold uppercase">Cronologia</h2>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr><th className={th}>Data</th><th className={th}>Usuário</th><th className={th}>Ação</th></tr></thead>
            <tbody>{acoes.map((a) => <tr key={a.id}><td className={`${td} whitespace-nowrap`}>{dateTime(a.criadoEm)}</td><td className={td}>{a.usuario}</td><td className={td}>{a.descricao}</td></tr>)}</tbody>
          </table>
        </section>

        {rec.conclusao && (
          <section>
            <h2 className="font-bold uppercase">Parecer final</h2>
            <p className="whitespace-pre-wrap">{rec.conclusao}</p>
          </section>
        )}
        {encerrado(rec.status) && (
          <section className="grid grid-cols-2 gap-8 pt-10">
            <div className="border-t border-black pt-1">Responsável pela Qualidade</div>
            <div className="border-t border-black pt-1">Responsável técnico / data</div>
          </section>
        )}
      </article>
    </div>
  );
}
