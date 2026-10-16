import { diasAtras } from "@/lib/format";
import { mascararNome } from "@/lib/privacidade";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { PERFIS_EDITAR } from "../../_lib/perfis";
import { lotesDisponiveis } from "../../_lib/remessas";
import { RemessaForm, type CirurgiaOpt, type KitOpt } from "./remessa-form";
import { soStrings } from "@/lib/search-params";

export default async function NovaRemessaPage({ searchParams }: { searchParams: Promise<{ cirurgiaId?: string }> }) {
  await requireUser(PERFIS_EDITAR);
  const { cirurgiaId } = soStrings(await searchParams);
  const desde = diasAtras(30);

  const [hospitais, cirurgias, kits, produtos, lotes] = await Promise.all([
    db.hospital.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
    db.cirurgia.findMany({
      where: {
        OR: [
          { status: { in: ["AGENDADA", "CONFIRMADA"] }, dataHora: { gte: desde } },
          ...(cirurgiaId ? [{ id: cirurgiaId }] : []),
        ],
      },
      include: { procedimento: { include: { itens: true } }, medico: { select: { nome: true } } },
      orderBy: { dataHora: "asc" },
      take: 300,
    }),
    db.kit.findMany({ include: { itens: true }, orderBy: { codigo: "asc" } }),
    db.produto.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricao: true }, orderBy: { descricao: "asc" } }),
    lotesDisponiveis(db),
  ]);

  const cirOpts: CirurgiaOpt[] = cirurgias.map((c) => ({
    id: c.id,
    label: `nº ${c.numero} — ${mascararNome(c.paciente)} — ${c.dataHora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })} — Dr(a). ${c.medico.nome}`,
    hospitalId: c.hospitalId,
    itens: (c.procedimento?.itens ?? []).map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
  }));
  const kitOpts: KitOpt[] = kits.map((k) => ({
    id: k.id,
    label: `${k.codigo} — ${k.descricao}`,
    itens: k.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
  }));
  const inicial = cirurgiaId && cirOpts.some((c) => c.id === cirurgiaId) ? cirurgiaId : undefined;

  return (
    <>
      <PageHeader
        title="Nova remessa"
        subtitle="Separação de materiais em consignação. Os lotes são sugeridos pela validade: o que vence primeiro sai primeiro."
      />
      <Card title="Separação de materiais">
        <RemessaForm
          hospitais={hospitais.map((h) => ({ value: h.id, label: h.nomeFantasia ?? h.razaoSocial }))}
          cirurgias={cirOpts}
          kits={kitOpts}
          produtos={produtos}
          lotes={lotes}
          cirurgiaInicial={inicial}
        />
      </Card>
    </>
  );
}
