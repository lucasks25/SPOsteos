import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, PageHeader, Table, Td, btn, type BadgeColor } from "@/components/ui";
import { dateTime, money, num } from "@/lib/format";
import { PERFIS_VER } from "../_lib/perfis";

const POR_PAGINA = 100;
const TIPOS = ["ENTRADA", "REMESSA", "RETORNO", "CONSUMO", "TRANSFERENCIA", "AJUSTE", "PERDA"] as const;
const COR: Record<string, BadgeColor> = { ENTRADA: "green", REMESSA: "blue", RETORNO: "teal", CONSUMO: "purple", TRANSFERENCIA: "gray", AJUSTE: "yellow", PERDA: "red" };

type SP = { produto?: string; lote?: string; local?: string; tipo?: string; de?: string; ate?: string; page?: string };

export default async function KardexPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(PERFIS_VER);
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
  const sel = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <>
      <PageHeader title="Kardex" subtitle="Histórico de movimentações por lote. Filtre por produto e local para ver o saldo corrente." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="produto" defaultValue={sp.produto ?? ""} className={`${sel} max-w-xs`}>
          <option value="">Todos os produtos</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>
          ))}
        </select>
        <select name="local" defaultValue={sp.local ?? ""} className={sel}>
          <option value="">Todos os locais</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
        <select name="tipo" defaultValue={sp.tipo ?? ""} className={sel}>
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>{t.toLowerCase()}</option>
          ))}
        </select>
        <input name="lote" defaultValue={sp.lote} placeholder="Lote" className={`${sel} w-28`} />
        <input name="de" type="date" defaultValue={sp.de} className={sel} />
        <input name="ate" type="date" defaultValue={sp.ate} className={sel} />
        <button className={btn.secondary}>Filtrar</button>
      </form>

      <Table head={["Data/hora", "Tipo", "Produto", "Lote", "Origem", "Destino", "Qtd.", "Custo unit.", "Documento", "Usuário", ...(comSaldo ? ["Saldo"] : [])]} empty={movs.length === 0}>
        {movs.map((m, idx) => {
          const sinal = deltas[idx] > 0 ? "+" : deltas[idx] < 0 ? "−" : "";
          return (
            <tr key={m.id}>
              <Td className="text-xs">{dateTime(m.criadoEm)}</Td>
              <Td><Badge color={COR[m.tipo]}>{m.tipo.toLowerCase()}</Badge></Td>
              <Td className="max-w-xs truncate">{m.produto.codigo} — {m.produto.descricao}</Td>
              <Td className="font-mono text-xs">
                <Link href={`/qualidade/lotes/${m.loteId}`} className="hover:underline">{m.lote.numero}</Link>
              </Td>
              <Td>{m.origem?.nome ?? "—"}</Td>
              <Td>{m.destino?.nome ?? (m.tipo === "CONSUMO" ? "paciente" : "—")}</Td>
              <Td className="font-semibold">{sinal}{num(m.quantidade)}</Td>
              <Td>{money(m.custoUnit)}</Td>
              <Td className="font-mono text-xs">{m.documento ?? "—"}</Td>
              <Td className="text-xs">{m.usuario ?? "—"}</Td>
              {comSaldo && <Td className="font-semibold">{num(saldos[idx])}</Td>}
            </tr>
          );
        })}
      </Table>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{num(total)} movimento(s) · página {page} de {paginas}</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={link(page - 1)} className={btn.secondary}>Anterior</Link>}
          {page < paginas && <Link href={link(page + 1)} className={btn.secondary}>Próxima</Link>}
        </div>
      </div>
    </>
  );
}
