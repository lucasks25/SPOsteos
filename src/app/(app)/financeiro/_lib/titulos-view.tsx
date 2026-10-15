import Link from "next/link";
import { Badge, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
import { date, money } from "@/lib/format";
import { TIPOS, type Tipo, type TituloRow } from "./config";
import { hojeUTC, ymd } from "./datas";
import { listarParceiros, listarTitulos, parseFiltros, type Filtros } from "./queries";

type SP = Record<string, string | string[] | undefined>;

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";

/** Situação do título, destacando vencidos. */
export function SituacaoTitulo({ t, hoje }: { t: Pick<TituloRow, "status" | "vencimento"> & { valorBaixado?: number }; hoje: Date }) {
  if (t.status === "ABERTO" && t.vencimento < hoje) {
    const dias = Math.round((hoje.getTime() - t.vencimento.getTime()) / 86_400_000);
    return <Badge color="red">vencido há {dias}d</Badge>;
  }
  if (t.status === "ABERTO" && (t.valorBaixado ?? 0) > 0) return <Badge color="blue">parcial</Badge>;
  return <StatusBadge status={t.status} />;
}

function FiltrosForm({ tipo, f, parceiros }: { tipo: Tipo; f: Filtros; parceiros: { value: string; label: string }[] }) {
  const cfg = TIPOS[tipo];
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Descrição</span>
        <input name="q" defaultValue={f.q} placeholder="Buscar..." className={`${inputCls} w-48`} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
        <select name="status" defaultValue={f.status} className={inputCls}>
          <option value="ABERTO">Em aberto</option>
          <option value="PAGO">{cfg.pagoLabel}</option>
          <option value="CANCELADO">Cancelado</option>
          <option value="TODOS">Todos</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">{cfg.parceiro}</span>
        <select name={cfg.parceiroParam} defaultValue={f.parceiroId ?? ""} className={`${inputCls} max-w-56`}>
          <option value="">Todos</option>
          {parceiros.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Vencimento de</span>
        <input type="date" name="de" defaultValue={f.de ? ymd(f.de) : ""} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">até</span>
        <input type="date" name="ate" defaultValue={f.ate ? ymd(f.ate) : ""} className={inputCls} />
      </label>
      <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
        <input type="checkbox" name="vencidos" value="1" defaultChecked={f.vencidos} className="h-4 w-4 rounded border-slate-300" />
        Somente vencidos
      </label>
      <button className={btn.secondary}>Filtrar</button>
      <Link href={cfg.path} className={btn.ghost}>
        Limpar
      </Link>
    </form>
  );
}

/** Tela de listagem compartilhada por contas a receber e a pagar. */
export async function TitulosLista({ tipo, searchParams }: { tipo: Tipo; searchParams: SP }) {
  const cfg = TIPOS[tipo];
  const hoje = hojeUTC();
  const f = parseFiltros(searchParams, cfg.parceiroParam);
  const [{ rows, totais }, parceiros] = await Promise.all([listarTitulos(tipo, f, hoje), listarParceiros(tipo)]);
  const pagoPeriodo = `${date(totais.pago.de)} a ${date(totais.pago.ate)}`;
  const totalLista = rows.reduce((s, r) => s + (r.status === "PAGO" ? (r.valorPago ?? 0) : r.saldo || r.valor), 0);

  const head = ["Vencimento", "Descrição", cfg.parceiro, "Conta do plano", "Valor", "Situação", cfg.pagoLabel, "Origem", ""];

  return (
    <>
      <PageHeader
        title={cfg.titulo}
        subtitle={tipo === "receber" ? "Títulos de hospitais e convênios" : "Obrigações com fornecedores e despesas"}
        actions={<LinkButton href={`${cfg.path}/novo`}>Novo título</LinkButton>}
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Em aberto" value={money(totais.aberto.valor)} hint={`${totais.aberto.qtd} título(s)`} />
        <Link href={`${cfg.path}?vencidos=1`} className="block">
          <Stat label="Vencido" value={money(totais.vencido.valor)} hint={`${totais.vencido.qtd} título(s) — ver vencidos`} tone={totais.vencido.qtd ? "danger" : "default"} />
        </Link>
        <Stat label={`${cfg.pagoLabel} no período`} value={money(totais.pago.valor)} hint={`${totais.pago.qtd} baixa(s) — ${pagoPeriodo}`} />
      </div>
      <FiltrosForm tipo={tipo} f={f} parceiros={parceiros} />
      <Table head={head} empty={rows.length === 0}>
        {rows.map((t) => (
          <tr key={t.id} className="hover:bg-slate-50">
            <Td>{date(t.vencimento)}</Td>
            <Td className="max-w-xs truncate">
              <Link href={`${cfg.path}/${t.id}`} className="text-teal-700 hover:underline">
                {t.descricao}
              </Link>
            </Td>
            <Td className="max-w-[14rem] truncate">{t.parceiroNome ?? "—"}</Td>
            <Td className="max-w-[12rem] truncate">{t.categoria ?? <span className="text-amber-700">Não classificado</span>}</Td>
            <Td className="text-right tabular-nums">{money(t.valor)}</Td>
            <Td>
              <SituacaoTitulo t={t} hoje={hoje} />
            </Td>
            <Td>{t.valorPago ? `${money(t.valorPago)} em ${date(t.pagoEm)}` : "—"}</Td>
            <Td>
              {t.pedidoId ? (
                <Link href={cfg.pedidoHref(t.pedidoId)} className="text-teal-700 hover:underline">
                  Pedido #{t.pedidoId}
                </Link>
              ) : (
                <span className="text-slate-400">manual</span>
              )}
            </Td>
            <Td>
              <Link href={`${cfg.path}/${t.id}`} className={btn.small}>
                {t.status === "ABERTO" ? "Baixar / editar" : "Abrir"}
              </Link>
            </Td>
          </tr>
        ))}
      </Table>
      {rows.length > 0 && (
        <p className="mt-2 text-right text-sm text-slate-500">
          {rows.length} título(s){rows.length === 500 && " (exibindo os 500 primeiros)"} — total listado <strong className="text-slate-800">{money(totalLista)}</strong>
        </p>
      )}
    </>
  );
}
