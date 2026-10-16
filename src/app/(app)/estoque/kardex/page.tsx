import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, KpiGrid, PageHeader, Stat, Table, Td, btn, type BadgeColor } from "@/components/ui";
import { FiltroInput, FiltroSelect, Filtros } from "@/components/filtros";
import { dateTime, money, num } from "@/lib/format";
import { PERFIS_VER } from "../_lib/perfis";

const POR_PAGINA = 100;
const TIPOS = ["ENTRADA", "REMESSA", "RETORNO", "CONSUMO", "TRANSFERENCIA", "AJUSTE", "PERDA"] as const;
const COR: Record<string, BadgeColor> = { ENTRADA: "green", REMESSA: "blue", RETORNO: "teal", CONSUMO: "purple", TRANSFERENCIA: "gray", AJUSTE: "yellow", PERDA: "red" };

type SP = { produto?: string; lote?: string; local?: string; tipo?: string; de?: string; ate?: string; page?: string };

export default async function KardexPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(PERFIS_VER);
  const verLote = ["ADMIN", "ESTOQUE", "QUALIDADE"].includes(user.perfil); // a tela do lote é da Qualidade
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(sp.produto ? { produtoId: sp.produto } : {}),
    ...(sp.lote ? { lote: { numero: { contains: sp.lote, mode: "insensitive" as const } } } : {}),
    ...(sp.local ? { OR: [{ origemId: sp.local }, { destinoId: sp.local }] } : {}),
    ...(sp.tipo && (TIPOS as readonly string[]).includes(sp.tipo) ? { tipo: sp.tipo as (typeof TIPOS)[number] } : {}),
    ...(sp.de || sp.ate
      ? { criadoEm: { ...(sp.de ? { gte: new Date(`${sp.de}T00:00:00-03:00`) } : {}), ...(sp.ate ? { lte: new Date(`${sp.ate}T23:59:59-03:00`) } : {}) } }
      : {}),
  };
  const [produtos, locais, total, movs] = await Promise.all([
    db.produto.findMany({ select: { id: true, codigo: true, descricao: true }, orderBy: { descricao: "asc" } }),
    db.localEstoque.findMany({ orderBy: { nome: "asc" } }),
    db.movimento.count({ where }),
    db.movimento.findMany({
      where,
      include: { produto: { select: { codigo: true, descricao: true } }, lote: { select: { numero: true } }, origem: true, destino: true },
      orderBy: { criadoEm: "asc" },
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);

  // Saldo corrente: só faz sentido com produto + local e sem filtros que cortem movimentos.
  const comSaldo = !!(sp.produto && sp.local && !sp.tipo && !sp.lote && !sp.de);
  let saldo = 0;
  if (comSaldo && page > 1) {
    const anteriores = await db.movimento.findMany({ where, orderBy: { criadoEm: "asc" }, take: (page - 1) * POR_PAGINA, select: { quantidade: true, origemId: true, destinoId: true } });
    for (const m of anteriores) saldo += (m.destinoId === sp.local ? m.quantidade : 0) - (m.origemId === sp.local ? m.quantidade : 0);
  }
  const saldos: number[] = [];
  const deltas: number[] = [];
  for (const m of movs) {
    const delta = comSaldo ? (m.destinoId === sp.local ? m.quantidade : 0) - (m.origemId === sp.local ? m.quantidade : 0) : 0;
    saldo += delta;
    deltas.push(delta);
    saldos.push(saldo);
  }
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    q.set("page", String(p));
    return `/estoque/kardex?${q}`;
  };

  return (
    <>
      <PageHeader title="Kardex" subtitle="Histórico de entradas e saídas por lote, para consulta do Estoque, Comercial e Qualidade. Filtre por produto e local para ver o saldo corrente." />
      <KpiGrid cols={3}>
        <Stat label="Movimentos no filtro" value={num(total)} hint={`página ${page} de ${paginas}`} />
        <Stat label="Entradas na página" value={num(movs.filter((m) => m.tipo === "ENTRADA").reduce((n, m) => n + m.quantidade, 0))} hint={<span className="text-emerald-700">unidades</span>} />
        <Stat label="Perdas e ajustes na página" value={num(movs.filter((m) => m.tipo === "PERDA" || m.tipo === "AJUSTE").length)} hint={<span className="text-amber-700">lançamento(s)</span>} />
      </KpiGrid>
      <Filtros limparHref="/estoque/kardex">
        <FiltroSelect label="Produto" name="produto" defaultValue={sp.produto} todos="Todos os produtos" options={produtos.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }))} />
        <FiltroSelect label="Local" name="local" defaultValue={sp.local} todos="Todos os locais" options={locais.map((l) => ({ value: l.id, label: l.nome }))} />
        <FiltroSelect label="Tipo" name="tipo" defaultValue={sp.tipo} todos="Todos os tipos" options={TIPOS.map((t) => ({ value: t, label: t.toLowerCase() }))} />
        <FiltroInput label="Lote" name="lote" defaultValue={sp.lote} placeholder="Nº do lote" className="w-28" />
        <FiltroInput label="De" name="de" type="date" defaultValue={sp.de} />
        <FiltroInput label="Até" name="ate" type="date" defaultValue={sp.ate} />
      </Filtros>

      <Table
        titulo="Movimentações"
        icone="livro"
        contagem={total}
        head={["Data/hora", "Tipo", "Produto", "Lote", "Origem → destino", "Qtd.", "Custo unit.", "Documento", ...(comSaldo ? ["Saldo"] : [])]}
        empty={movs.length === 0}
        emptyText="Nenhuma movimentação encontrada para os filtros informados."
      >
        {movs.map((m, idx) => {
          const sinal = deltas[idx] > 0 ? "+" : deltas[idx] < 0 ? "−" : "";
          return (
            <tr key={m.id}>
              <Td>
                <div>{dateTime(m.criadoEm)}</div>
                <div className="text-[11px] text-slate-500">{m.usuario ?? "—"}</div>
              </Td>
              <Td><Badge color={COR[m.tipo]}>{m.tipo.toLowerCase()}</Badge></Td>
              <Td className="max-w-xs">
                <div className="truncate font-medium">{m.produto.descricao}</div>
                <div className="font-mono text-[11px] text-slate-500">{m.produto.codigo}</div>
              </Td>
              <Td className="font-mono text-xs">
                {verLote ? <Link href={`/qualidade/lotes/${m.loteId}`} className="text-teal-700 hover:underline">{m.lote.numero}</Link> : m.lote.numero}
              </Td>
              <Td>
                <div>{m.origem?.nome ?? "—"}</div>
                <div className="text-xs text-slate-500">→ {m.destino?.nome ?? (m.tipo === "CONSUMO" ? "paciente" : "—")}</div>
              </Td>
              <Td className="tnum text-right font-semibold">{sinal}{num(m.quantidade)}</Td>
              <Td className="tnum text-right">{money(m.custoUnit)}</Td>
              <Td className="font-mono text-xs">{m.documento ?? "—"}</Td>
              {comSaldo && <Td className="tnum text-right font-semibold">{num(saldos[idx])}</Td>}
            </tr>
          );
        })}
      </Table>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span className="tnum">{num(total)} movimento(s) · página {page} de {paginas}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={link(page - 1)} className={btn.secondary}>Anterior</Link>}
          {page < paginas && <Link href={link(page + 1)} className={btn.secondary}>Próxima</Link>}
        </div>
      </div>
    </>
  );
}
