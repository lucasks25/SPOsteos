import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, btn, cx, KpiGrid, PageHeader, Stat, Table, Td } from "@/components/ui";
import { date, diasAte } from "@/lib/format";
import { PERFIS_QUALIDADE } from "../_lib/perfis";

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
      <PageHeader title="Registros ANVISA" subtitle="Para a Qualidade: acompanhe a validade dos registros e notificações dos produtos na ANVISA. A correção é feita no cadastro do produto." />
      <KpiGrid cols={5}>
        <Stat icon="calendario" label="Vencidos" value={cont("vencido")} tone={cont("vencido") ? "danger" : "default"} />
        <Stat icon="calendario" label="Até 90 dias" value={cont("90")} tone={cont("90") ? "warn" : "default"} />
        <Stat icon="calendario" label="91–180 dias" value={cont("180")} />
        <Stat icon="ok" label="Em dia" value={cont("ok")} />
        <Stat icon="documento" label="Sem registro" value={cont("sem_registro")} tone={cont("sem_registro") ? "warn" : "default"} hint={`${cont("sem_validade")} sem data de validade`} />
      </KpiGrid>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={inativos ? "?inativos=1" : "?"} className={cx("rounded-full border px-3 py-1", !filtro ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
          Todos
        </Link>
        {FILTROS.map((s) => (
          <Link key={s} href={`${base}f=${s}`} className={cx("rounded-full border px-3 py-1", filtro === s ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
            {ROTULO[s]} ({cont(s)})
          </Link>
        ))}
        <Link href={inativos ? (filtro ? `?f=${filtro}` : "?") : `?inativos=1${filtro ? `&f=${filtro}` : ""}`} className={cx(btn.small, "ml-auto")}>
          {inativos ? "Ocultar inativos" : "Incluir inativos"}
        </Link>
      </div>
      <Table titulo="Produtos e registros" icone="livro" contagem={lista.length} head={["Produto", "Classe", "Registro ANVISA", "Validade", "Situação", ""]} empty={lista.length === 0} emptyText="Nenhum produto nesta situação de registro.">
        {lista.map(({ p, s }) => {
          const d = p.validadeRegistro ? diasAte(p.validadeRegistro) : null;
          return (
            <tr key={p.id} className={cx(s === "vencido" && "bg-rose-50/60", s === "90" && "bg-amber-50/60")}>
              <Td>
                <Link href={`/cadastros/produtos/${p.id}`} className="font-medium text-teal-700 hover:underline">{p.descricao}</Link> {!p.ativo && <Badge>inativo</Badge>}
                <div className="text-xs text-slate-500"><span className="font-mono">{p.codigo}</span> · {p.fabricante?.nome ?? "sem fabricante"}</div>
              </Td>
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
                <Link href={`/cadastros/produtos/${p.id}`} className={btn.small}>Abrir no cadastro</Link>
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
