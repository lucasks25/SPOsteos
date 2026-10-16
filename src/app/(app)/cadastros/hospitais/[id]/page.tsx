import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/form";
import { podeIrParaCirurgias, podeIrParaReceber, podeIrParaSaldos } from "../../_lib/permissoes";
import { HospitalForm } from "../hospital-form";
import { alternarAtivoHospital, excluirHospital } from "../actions";

export default async function HospitalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [hospital, tabelas, saldos] = await Promise.all([
    db.hospital.findUnique({
      where: { id },
      include: {
        local: { select: { id: true, nome: true } },
        _count: { select: { cirurgias: true, pedidos: true, orcamentos: true, contasReceber: true } },
      },
    }),
    db.tabelaPreco.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.saldo.count({ where: { local: { hospitalId: id }, quantidade: { gt: 0 } } }),
  ]);
  if (!hospital) notFound();
  const c = hospital._count;
  const podeExcluir = c.cirurgias + c.pedidos + c.orcamentos + c.contasReceber === 0 && saldos === 0;
  const links = [
    podeIrParaCirurgias(user.perfil) && { href: `/comercial/cirurgias?hospital=${id}`, label: "Cirurgias deste hospital" },
    hospital.local && podeIrParaSaldos(user.perfil) && { href: `/estoque/saldos?local=${hospital.local.id}`, label: "Estoque consignado" },
    podeIrParaReceber(user.perfil) && { href: `/financeiro/receber?hospital=${id}`, label: "Contas a receber" },
  ].filter((l): l is { href: string; label: string } => !!l);

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
      <Card title="Dados cadastrais">
        <HospitalForm key={String(hospital.ativo)} hospital={hospital} tabelas={tabelas} />
      </Card>
      {links.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
          Ver em outros módulos:
          {links.map((l) => <Link key={l.href} href={l.href} className="text-teal-700 hover:underline">{l.label}</Link>)}
        </p>
      )}
    </>
  );
}
