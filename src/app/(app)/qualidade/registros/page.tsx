import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, cx, PageHeader, Stat, Table, Td } from "@/components/ui";
import { date, diasAte } from "@/lib/format";
import { PERFIS_QUALIDADE } from "../_lib/datas";

type Situacao = "vencido" | "90" | "180" | "ok" | "sem_validade" | "sem_registro";

function situacao(p: { registroAnvisa: string | null; validadeRegistro: Date | null }): Situacao {
  if (!p.registroAnvisa) return "sem_registro";
  if (!p.validadeRegistro) return "sem_validade";
  const d = diasAte(p.validadeRegistro);
  if (d < 0) return "vencido";
  if (d <= 90) return "90";
  if (d <= 180) return "180";
  return "ok";
}

const ROTULO: Record<Situacao, string> = {
  vencido: "Vencidos",
  "90": "Vencem em até 90 dias",
  "180": "Vencem em 91–180 dias",
  ok: "Em dia",
  sem_validade: "Sem data de validade",
  sem_registro: "Sem registro ANVISA",
};

const FILTROS: Situacao[] = ["vencido", "90", "180", "ok", "sem_validade", "sem_registro"];

export default async function RegistrosPage({ searchParams }: { searchParams: Promise<{ f?: string; inativos?: string }> }) {
  await requireUser(PERFIS_QUALIDADE);
  const { f, inativos } = await searchParams;
  const filtro = FILTROS.includes(f as Situacao) ? (f as Situacao) : undefined;
  const produtos = await db.produto.findMany({
    where: inativos ? undefined : { ativo: true },
    include: { fabricante: { select: { nome: true } } },
    orderBy: [{ validadeRegistro: { sort: "asc", nulls: "last" } }, { descricao: "asc" }],
  });
  const comSit = produtos.map((p) => ({ p, s: situacao(p) }));
  const cont = (s: Situacao) => comSit.filter((x) => x.s === s).length;
  const lista = filtro ? comSit.filter((x) => x.s === filtro) : comSit;
  const base = inativos ? "?inativos=1&" : "?";

  return (
    <>
      <PageHeader title="Registros ANVISA" subtitle="Validade dos registros/notificações dos produtos" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Vencidos" value={cont("vencido")} tone={cont("vencido") ? "danger" : "default"} />
        <Stat label="Até 90 dias" value={cont("90")} tone={cont("90") ? "warn" : "default"} />
        <Stat label="91–180 dias" value={cont("180")} />
        <Stat label="Em dia" value={cont("ok")} />
        <Stat label="Sem registro" value={cont("sem_registro")} tone={cont("sem_registro") ? "warn" : "default"} hint={`${cont("sem_validade")} sem data de validade`} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={inativos ? "?inativos=1" : "?"} className={cx("rounded-full border px-3 py-1", !filtro ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-600")}>
          Todos
        </Link>
        {FILTROS.map((s) => (
          <Link key={s} href={`${base}f=${s}`} className={cx("rounded-full border px-3 py-1", filtro === s ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-600")}>
            {ROTULO[s]} ({cont(s)})
          </Link>
        ))}
        <Link href={inativos ? (filtro ? `?f=${filtro}` : "?") : `?inativos=1${filtro ? `&f=${filtro}` : ""}`} className="ml-auto px-3 py-1 text-teal-700 hover:underline">
          {inativos ? "Ocultar inativos" : "Incluir inativos"}
        </Link>
      </div>
      <Table head={["Código", "Descrição", "Fabricante", "Classe", "Registro ANVISA", "Validade", "Situação", ""]} empty={lista.length === 0}>
        {lista.map(({ p, s }) => {
          const d = p.validadeRegistro ? diasAte(p.validadeRegistro) : null;
          return (
            <tr key={p.id} className={cx("hover:bg-slate-50", s === "vencido" && "bg-rose-50/60", s === "90" && "bg-amber-50/60")}>
              <Td className="font-mono text-xs">{p.codigo}</Td>
              <Td>
                {p.descricao} {!p.ativo && <Badge>inativo</Badge>}
              </Td>
              <Td>{p.fabricante?.nome ?? "—"}</Td>
              <Td>{p.classeRisco ?? "—"}</Td>
              <Td>{p.registroAnvisa ?? "—"}</Td>
              <Td>{date(p.validadeRegistro)}</Td>
              <Td>
                {s === "vencido" && <Badge color="red">vencido há {Math.abs(d!)}d</Badge>}
                {s === "90" && <Badge color="yellow">vence em {d}d</Badge>}
                {s === "180" && <Badge color="blue">vence em {d}d</Badge>}
                {s === "ok" && <Badge color="green">em dia</Badge>}
                {s === "sem_validade" && <Badge color="gray">sem validade</Badge>}
                {s === "sem_registro" && <Badge color="yellow">sem registro</Badge>}
              </Td>
              <Td>
                <Link href={`/cadastros/produtos/${p.id}`} className="text-teal-700 hover:underline">Editar</Link>
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
