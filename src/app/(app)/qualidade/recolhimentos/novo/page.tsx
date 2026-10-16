import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, campo, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { date, num } from "@/lib/format";
import { Filtros } from "@/components/filtros";
import { CLASSES, ORIGENS, PERFIS_OPERAR_RECOLHIMENTO, ROTULO_CLASSE, ROTULO_ORIGEM } from "../../_lib/recolhimento";
import { abrirRecolhimentoAction } from "../actions";

const inputCls = campo;

export default async function NovoRecolhimentoPage({ searchParams }: { searchParams: Promise<{ q?: string; loteId?: string }> }) {
  await requireUser(PERFIS_OPERAR_RECOLHIMENTO);
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const lotes = q || sp.loteId
    ? await db.lote.findMany({
        where: sp.loteId && !q
          ? { id: sp.loteId }
          : { OR: [{ numero: { contains: q!, mode: "insensitive" } }, { serie: { contains: q!, mode: "insensitive" } }, { produto: { codigo: { contains: q!, mode: "insensitive" } } }, { produto: { descricao: { contains: q!, mode: "insensitive" } } }] },
        include: { produto: { select: { codigo: true, descricao: true } }, saldos: { where: { quantidade: { gt: 0 }, local: { tipo: { not: "NAO_CONFORME" } } }, select: { quantidade: true } } },
        orderBy: [{ produto: { descricao: "asc" } }, { validade: "asc" }],
        take: 60,
      })
    : [];

  return (
    <>
      <PageHeader voltar={{ href: "/qualidade/recolhimentos", label: "Recolhimentos" }} title="Novo recolhimento" subtitle="Ao abrir, os lotes escolhidos ficam bloqueados (não saem em remessa nem são consumidos) e o sistema fotografa onde há saldo e quais cirurgias usaram o lote." />
      <Filtros limparHref="/qualidade/recolhimentos/novo">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">Buscar lote, série, produto ou código</span>
          <input name="q" defaultValue={q} placeholder="Ex.: número do lote" className={`${inputCls} w-72`} />
        </label>
      </Filtros>
      {lotes.length === 0 ? (
        <Card><EmptyState text={q ? "Nenhum lote encontrado para a busca." : "Busque o lote ou o produto afetado para continuar."} /></Card>
      ) : (
        <Form action={abrirRecolhimentoAction} submitLabel="Abrir recolhimento e bloquear lotes" className="space-y-3">
          <Card title="Lotes afetados" icon="frasco">
            <ul className="divide-y divide-slate-200">
              {lotes.map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                    <input type="checkbox" name="loteId" value={l.id} defaultChecked={l.id === sp.loteId} className="h-4 w-4 rounded-sm border-slate-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{l.produto.descricao}</span>
                      <span className="block font-mono text-xs text-slate-500">{l.produto.codigo} · lote {l.numero} · val. {date(l.validade)}</span>
                    </span>
                    <StatusBadge status={l.status} />
                    <span className="tnum w-24 text-right">{num(l.saldos.reduce((v, s) => v + s.quantidade, 0))} un.</span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Dados da ação de campo" icon="alerta">
            <div className="space-y-4">
              <Grid cols={3}>
                <Select label="Origem *" name="origem" required options={ORIGENS.map((o) => ({ value: o, label: ROTULO_ORIGEM[o] }))} />
                <Select label="Classe de risco da ação *" name="classe" required options={CLASSES.map((c) => ({ value: c, label: ROTULO_CLASSE[c] }))} />
                <Field label="Prazo" name="prazo" type="date" hint="data limite para concluir" />
              </Grid>
              <Field label="Nº do alerta / referência" name="referencia" maxLength={80} hint="alerta sanitário da ANVISA, comunicado do fabricante, nº da não conformidade" />
              <TextArea label="Motivo *" name="motivo" required maxLength={2000} />
              <TextArea label="Observação" name="observacao" maxLength={500} />
              <p className="text-xs text-slate-600">
                <Badge color="yellow">atenção</Badge> O bloqueio é imediato e vale para todos os usuários. Se o recolhimento for cancelado antes de qualquer recolhimento físico, só os lotes que este recolhimento bloqueou voltam ao status anterior.
              </p>
            </div>
          </Card>
        </Form>
      )}
    </>
  );
}
