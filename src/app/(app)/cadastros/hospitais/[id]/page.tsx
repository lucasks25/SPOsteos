import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { money, num, toNumber } from "@/lib/format";
import { HospitalForm } from "../hospital-form";
import { alternarAtivoHospital, excluirHospital } from "../actions";
import { carregarConsignado, EstoqueConsignado, UltimasCirurgias } from "./paineis";

export default async function HospitalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const [hospital, tabelas, saldos, receber, vencidas] = await Promise.all([
    db.hospital.findUnique({
      where: { id },
      include: {
        local: { select: { id: true, nome: true } },
        _count: { select: { cirurgias: true, pedidos: true, orcamentos: true, contasReceber: true } },
      },
    }),
    db.tabelaPreco.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    carregarConsignado(id),
    db.contaReceber.aggregate({ where: { hospitalId: id, status: "ABERTO" }, _sum: { valor: true, valorPago: true }, _count: true }),
    db.contaReceber.aggregate({ where: { hospitalId: id, status: "ABERTO", vencimento: { lt: new Date() } }, _sum: { valor: true, valorPago: true }, _count: true }),
  ]);
  if (!hospital) notFound();
  const totalConsignado = saldos.reduce((s, x) => s + x.quantidade, 0);
  const produtosConsignados = new Set(saldos.map((s) => s.produtoId)).size;
  const c = hospital._count;
  const podeExcluir = c.cirurgias + c.pedidos + c.orcamentos + c.contasReceber === 0 && saldos.length === 0;

  return (
    <>
      <PageHeader
        title={hospital.nomeFantasia ?? hospital.razaoSocial}
        subtitle={`${hospital.razaoSocial} · CNPJ ${hospital.cnpj}`}
        actions={
          <>
            {!hospital.ativo && <Badge>inativo</Badge>}
            <ActionButton action={alternarAtivoHospital.bind(null, id)}>{hospital.ativo ? "Inativar" : "Ativar"}</ActionButton>
            {podeExcluir && (
              <ActionButton action={excluirHospital.bind(null, id)} variant="danger" confirm="Excluir este hospital?">
                Excluir
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Itens consignados" value={num(totalConsignado)} hint={`${produtosConsignados} produto(s)`} />
        <Stat label="Cirurgias" value={num(c.cirurgias)} />
        <Stat label="A receber (aberto)" value={money(toNumber(receber._sum.valor) - toNumber(receber._sum.valorPago))} hint={`${receber._count} título(s)`} />
        <Stat
          label="Vencido"
          value={money(toNumber(vencidas._sum.valor) - toNumber(vencidas._sum.valorPago))}
          hint={`${vencidas._count} título(s)`}
          tone={vencidas._count > 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Dados cadastrais">
            <HospitalForm key={String(hospital.ativo)} hospital={hospital} tabelas={tabelas} />
          </Card>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Estoque consignado {hospital.local && <span className="font-normal text-slate-400">— {hospital.local.nome}</span>}
            </h2>
            <EstoqueConsignado saldos={saldos} />
          </section>
        </div>
        <div>
          <UltimasCirurgias hospitalId={id} />
        </div>
      </div>
    </>
  );
}
