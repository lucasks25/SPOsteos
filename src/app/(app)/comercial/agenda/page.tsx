import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { LinkButton, PageHeader, btn, cx } from "@/components/ui";
import { Filtros, FiltroSelect } from "../_components/filtros";
import { diaSP, inicioDiaSP, segundaDaSemana, somaDias } from "../_lib/datas";
import { nomeHospital, opcoesHospitais, opcoesRepresentantes } from "../_lib/opcoes";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const COR: Record<string, string> = {
  AGENDADA: "border-sky-300 bg-sky-50",
  CONFIRMADA: "border-teal-300 bg-teal-50",
  REALIZADA: "border-violet-300 bg-violet-50",
  FATURADA: "border-emerald-300 bg-emerald-50",
  CANCELADA: "border-slate-200 bg-slate-50 opacity-60 line-through",
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string; hospital?: string; representante?: string }> }) {
  await requireUser(["COMERCIAL", "FINANCEIRO"]);
  const sp = await searchParams;
  const seg = segundaDaSemana(sp.semana);
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(seg, i));
  const [cirurgias, hospitais, representantes] = await Promise.all([
    db.cirurgia.findMany({
      where: {
        dataHora: { gte: inicioDiaSP(seg), lt: inicioDiaSP(somaDias(seg, 7)) },
        ...(sp.hospital ? { hospitalId: sp.hospital } : {}),
        ...(sp.representante ? { representanteId: sp.representante } : {}),
      },
      include: { hospital: true, medico: true, procedimento: true, representante: true, _count: { select: { remessas: true } } },
      orderBy: { dataHora: "asc" },
    }),
    opcoesHospitais(),
    opcoesRepresentantes(),
  ]);
  const hoje = diaSP(new Date());
  const qs = (semana: string) => {
    const q = new URLSearchParams({ semana });
    if (sp.hospital) q.set("hospital", sp.hospital);
    if (sp.representante) q.set("representante", sp.representante);
    return `/comercial/agenda?${q}`;
  };
  const fmt = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");
  const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PageHeader
        title="Agenda cirúrgica"
        subtitle={`Semana de ${fmt(dias[0])} a ${fmt(dias[6])} · ${cirurgias.length} cirurgia(s) — navegue pelas semanas ou filtre por hospital e representante`}
        actions={
          <>
            <Link href={qs(somaDias(seg, -7))} className={btn.secondary}><Icon name="direita" size={16} className="rotate-180" aria-hidden="true" />Anterior</Link>
            <Link href={qs(segundaDaSemana())} className={btn.secondary}>Hoje</Link>
            <Link href={qs(somaDias(seg, 7))} className={btn.secondary}>Próxima<Icon name="direita" size={16} aria-hidden="true" /></Link>
            <LinkButton href="/comercial/cirurgias/nova">Agendar cirurgia</LinkButton>
          </>
        }
      />
      <Filtros limparHref="/comercial/agenda">
        <input type="hidden" name="semana" value={seg} />
        <FiltroSelect label="Hospital" name="hospital" options={hospitais} defaultValue={sp.hospital} />
        <FiltroSelect label="Representante" name="representante" options={representantes} defaultValue={sp.representante} />
      </Filtros>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {dias.map((dia, i) => {
          const doDia = cirurgias.filter((c) => diaSP(c.dataHora) === dia);
          return (
            <div key={dia} className={cx("min-h-40 rounded border bg-white p-2", dia === hoje ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200")}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-xs font-semibold uppercase text-slate-600">{DIAS[i]}</span>
                <span className={cx("text-sm", dia === hoje ? "font-bold text-teal-700" : "text-slate-700")}>{fmt(dia)}</span>
              </div>
              <div className="space-y-2">
                {doDia.length === 0 && <div className="px-1 text-xs text-slate-500">Sem cirurgias</div>}
                {doDia.map((c) => (
                  <Link key={c.id} href={`/comercial/cirurgias/${c.id}`} className={cx("block rounded border p-2 text-xs hover:shadow-sm", COR[c.status])}>
                    <div className="font-semibold text-slate-800">{hora(c.dataHora)} · CIR-{c.numero}</div>
                    <div className="truncate text-slate-700">{nomeHospital(c.hospital)}</div>
                    <div className="truncate text-slate-600">{c.medico.nome}</div>
                    {c.procedimento && <div className="truncate text-slate-600">{c.procedimento.descricao}</div>}
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                      <span className="font-medium capitalize">{c.status.toLowerCase()}</span>
                      <span>{c._count.remessas ? `${c._count.remessas} vale${c._count.remessas > 1 ? "s" : ""}` : "sem vale"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
