import Link from "next/link";
import { Field, Select } from "@/components/form";
import { Badge, FilterBar, KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, btn } from "@/components/ui";
import { date, money } from "@/lib/format";
import { TIPOS, type Tipo, type TituloRow } from "./config";
import { hojeUTC, ymd } from "./datas";
import { listarParceiros, listarTitulos, parseFiltros, type Filtros } from "./queries";

type SP = Record<string, string | string[] | undefined>;

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
    <FilterBar>
      <Field label="Descrição" name="q" defaultValue={f.q} placeholder="Buscar..." className="w-48" />
      <Select
        label="Situação"
        name="status"
        defaultValue={f.status}
        placeholder=""
        className="w-40"
        options={[
          { value: "ABERTO", label: "Em aberto" },
          { value: "PAGO", label: cfg.pagoLabel },
          { value: "CANCELADO", label: "Cancelado" },
          { value: "TODOS", label: "Todos" },
        ]}
      />
      <Select label={cfg.parceiro} name={cfg.parceiroParam} defaultValue={f.parceiroId ?? ""} options={parceiros} placeholder="Todos" className="w-56" />
      <Field label="Vencimento de" name="de" type="date" defaultValue={f.de ? ymd(f.de) : ""} className="w-40" />
      <Field label="Vencimento até" name="ate" type="date" defaultValue={f.ate ? ymd(f.ate) : ""} className="w-40" />
      <label className="flex h-8 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="vencidos" value="1" defaultChecked={f.vencidos} className="h-4 w-4 rounded-sm border-slate-300" />
        Somente vencidos
      </label>
      <button className={btn.secondary}>Filtrar</button>
      <Link href={cfg.path} className={btn.ghost}>
        Limpar
      </Link>
    </FilterBar>
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

  const head = ["Vencimento", "Descrição", cfg.parceiro, "Conta do plano", "Valor", "Situação", cfg.pagoLabel, "Origem", "Ações"];

  return (
    <>
      <PageHeader
        title={cfg.titulo}
        subtitle={tipo === "receber" ? "Títulos de hospitais e convênios: filtre, abra um título e registre a baixa." : "Obrigações com fornecedores e despesas: filtre, abra um título e registre a baixa."}
        actions={<LinkButton href={`${cfg.path}/novo`}>Novo título</LinkButton>}
      />
      <KpiGrid cols={3}>
        <Stat label="Em aberto" value={money(totais.aberto.valor)} hint={`${totais.aberto.qtd} título(s)`} />
        <Link href={`${cfg.path}?vencidos=1`} className="block">
          <Stat label="Vencido" value={money(totais.vencido.valor)} hint={`${totais.vencido.qtd} título(s) — ver vencidos`} tone={totais.vencido.qtd ? "danger" : "default"} />
        </Link>
        <Stat label={`${cfg.pagoLabel} no período`} value={money(totais.pago.valor)} hint={`${totais.pago.qtd} baixa(s) — ${pagoPeriodo}`} />
      </KpiGrid>
      <FiltrosForm tipo={tipo} f={f} parceiros={parceiros} />
      <Table
        head={head}
        empty={rows.length === 0}
        emptyText={tipo === "receber" ? "Nenhum título a receber com esses filtros." : "Nenhuma conta a pagar com esses filtros."}
        emptyAction={<LinkButton href={`${cfg.path}/novo`} variant="secondary">Novo título</LinkButton>}
      >
        {rows.map((t) => (
          <tr key={t.id}>
            <Td>{date(t.vencimento)}</Td>
            <Td className="max-w-xs truncate">
              <Link href={`${cfg.path}/${t.id}`} className="text-teal-700 hover:underline">
                {t.descricao}
              </Link>
            </Td>
            <Td className="max-w-[14rem] truncate">{t.parceiroNome ?? "—"}</Td>
            <Td className="max-w-[12rem] truncate">{t.categoria ?? <span className="text-amber-700">Não classificado</span>}</Td>
            <Td className="text-right tnum">{money(t.valor)}</Td>
            <Td>
              <SituacaoTitulo t={t} hoje={hoje} />
            </Td>
            <Td className="text-right tnum">{t.valorPago ? `${money(t.valorPago)} em ${date(t.pagoEm)}` : "—"}</Td>
            <Td>
              {t.pedidoId ? (
                <Link href={cfg.pedidoHref(t.pedidoId)} className="text-teal-700 hover:underline">
                  Pedido #{t.pedidoId}
                </Link>
              ) : (
                <span className="text-slate-500">manual</span>
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
        <p className="tnum mt-2 text-right text-sm text-slate-600">
          {rows.length} título(s){rows.length === 500 && " (exibindo os 500 primeiros)"} — total listado <strong className="text-slate-800">{money(totalLista)}</strong>
        </p>
      )}
    </>
  );
}
