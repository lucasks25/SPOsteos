import Link from "next/link";
import type { Prisma, StatusInventario } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KpiGrid, LinkButton, PageHeader, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { FiltroSelect, Filtros } from "@/components/filtros";
import { dateTime, money, num, toNumber } from "@/lib/format";
import { PERFIS_VER_INVENTARIO, podeEditar } from "../_lib/perfis";
import { docInventario, revisarInventario } from "../_lib/inventario-servico";

const STATUS: StatusInventario[] = ["ABERTO", "CONTADO", "FECHADO", "CANCELADO"];

export default async function InventariosPage({ searchParams }: { searchParams: Promise<{ status?: string; hospitalId?: string; cobrar?: string }> }) {
  const user = await requireUser(PERFIS_VER_INVENTARIO);
  const sp = await searchParams;
  const status = STATUS.includes(sp.status as StatusInventario) ? (sp.status as StatusInventario) : undefined;
  const soCobrar = sp.cobrar === "1";
  const where: Prisma.InventarioConsignacaoWhereInput = {
    ...(status ? { status } : {}),
    ...(sp.hospitalId ? { hospitalId: sp.hospitalId } : {}),
    // valores a cobrar dos hospitais (falta com resolução "cobrar do hospital"): só leitura, o título é lançado pelo financeiro
    ...(soCobrar ? { status: "FECHADO" as const, itens: { some: { valorCobrar: { gt: 0 } } } } : {}),
  };
  const inicioAno = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [lista, hospitais, andamento, fechadosAno] = await Promise.all([
    db.inventarioConsignacao.findMany({
      where,
      include: { hospital: { select: { razaoSocial: true, nomeFantasia: true } }, itens: { select: { contado: true, diferenca: true, resolucao: true, valorUnit: true, valorCobrar: true } } },
      orderBy: { id: "desc" },
      take: 200,
    }),
    db.hospital.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
    db.inventarioConsignacao.findMany({ where: { status: { in: ["ABERTO", "CONTADO"] } }, select: { id: true } }),
    db.inventarioConsignacaoItem.findMany({
      where: { inventario: { status: "FECHADO", fechadoEm: { gte: inicioAno } }, diferenca: { lt: 0 } },
      select: { diferenca: true, valorUnit: true, resolucao: true, valorCobrar: true },
    }),
  ]);
  // divergências em aberto: calculadas contra o saldo de hoje
  let divAbertas = 0;
  for (const a of andamento) divAbertas += (await revisarInventario(db, a.id)).resumo.divergentes;
  const perdasAno = fechadosAno.filter((i) => i.resolucao === "AJUSTE").reduce((v, i) => v + -(i.diferenca ?? 0) * Math.round(toNumber(i.valorUnit) * 100), 0) / 100;
  const cobrarAno = fechadosAno.reduce((v, i) => v + toNumber(i.valorCobrar), 0);

  return (
    <>
      <PageHeader
        title="Inventário de consignado"
        subtitle="Para o Estoque: contagem física do material nos hospitais comparada com o saldo do sistema."
        actions={podeEditar(user.perfil) && <LinkButton href="/estoque/inventario/novo" icon="mais">Novo inventário</LinkButton>}
      />
      <KpiGrid cols={3}>
        <Stat icon="lista" label="Inventários em andamento" value={num(andamento.length)} hint="abertos ou contados, a fechar" tone={andamento.length ? "warn" : "default"} />
        <Stat icon="alerta" label="Divergências em aberto" value={num(divAbertas)} hint="itens contados diferentes do saldo de hoje" tone={divAbertas ? "danger" : "default"} />
        <Stat icon="pagar" label="Perdas no ano" value={money(perdasAno)} hint={`ao custo médio; a cobrar dos hospitais: ${money(cobrarAno)}`} tone={perdasAno ? "danger" : "default"} />
      </KpiGrid>
      <Filtros limparHref="/estoque/inventario">
        <FiltroSelect label="Status" name="status" defaultValue={status} todos="Todos os status" options={STATUS.map((s) => ({ value: s, label: s.toLowerCase() }))} />
        <FiltroSelect label="A cobrar" name="cobrar" defaultValue={soCobrar ? "1" : undefined} todos="Todos" options={[{ value: "1", label: "Só com valor a cobrar do hospital" }]} />
        <FiltroSelect label="Hospital" name="hospitalId" defaultValue={sp.hospitalId} todos="Todos os hospitais" options={hospitais.map((h) => ({ value: h.id, label: h.nomeFantasia ?? h.razaoSocial }))} />
      </Filtros>
      <Table
        titulo="Inventários"
        icone="lista"
        contagem={lista.length}
        head={["Nº", "Hospital", "Situação", "Criado", "Itens", "Contados", "Divergências", "Faltas (R$)", "A cobrar (R$)"]}
        empty={lista.length === 0}
        emptyText="Nenhum inventário encontrado."
        emptyAction={podeEditar(user.perfil) ? <LinkButton href="/estoque/inventario/novo" icon="mais">Novo inventário</LinkButton> : undefined}
      >
        {lista.map((inv) => {
          const fechado = inv.status === "FECHADO";
          const div = inv.itens.filter((i) => (i.diferenca ?? 0) !== 0);
          const aCobrar = inv.itens.reduce((v, i) => v + toNumber(i.valorCobrar), 0);
          const faltas = inv.itens.filter((i) => (i.diferenca ?? 0) < 0).reduce((v, i) => v + -(i.diferenca ?? 0) * Math.round(toNumber(i.valorUnit) * 100), 0) / 100;
          return (
            <tr key={inv.id}>
              <Td><Link href={`/estoque/inventario/${inv.id}`} className="font-mono font-medium text-teal-700 hover:underline">{docInventario(inv.id)}</Link></Td>
              <Td>{inv.hospital.nomeFantasia ?? inv.hospital.razaoSocial}</Td>
              <Td><StatusBadge status={inv.status} /></Td>
              <Td>
                <div>{dateTime(inv.criadoEm)}</div>
                <div className="text-xs text-slate-500">{inv.criadoPor}</div>
              </Td>
              <Td className="tnum text-right">{num(inv.itens.length)}</Td>
              <Td className="tnum text-right">{num(inv.itens.filter((i) => i.contado !== null).length)}</Td>
              <Td className="tnum text-right">{fechado ? num(div.length) : "—"}</Td>
              <Td className="tnum text-right">{fechado ? money(faltas) : "—"}</Td>
              <Td className="tnum text-right">
                {fechado && aCobrar > 0 ? (
                  <Link href={`/estoque/inventario/${inv.id}`} className="text-teal-700 hover:underline" title="Falta a cobrar do hospital: conferir e lançar a conta a receber no financeiro">
                    {money(aCobrar)} a cobrar
                  </Link>
                ) : "—"}
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
