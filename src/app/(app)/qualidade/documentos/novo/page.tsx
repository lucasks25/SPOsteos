import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { ESCOPOS, PERFIS_EDITAR_DOCUMENTOS, ROTULO_TIPO, TIPOS, type EscopoDoc, type TipoDoc } from "../../_lib/documentos";
import { VIGENTES } from "../../_lib/documentos-servico";
import { DocumentoNovoForm, type Candidato, type Inicial } from "../documento-form";

type SP = { escopo?: string; tipo?: string; fornecedorId?: string; fabricanteId?: string; produtoId?: string; renovar?: string };

export default async function NovoDocumentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(PERFIS_EDITAR_DOCUMENTOS);
  const sp = await searchParams;
  const [fornecedores, fabricantes, produtos, vigentes] = await Promise.all([
    db.fornecedor.findMany({ where: { ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: { razaoSocial: "asc" } }),
    db.fabricante.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.produto.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricao: true }, orderBy: { descricao: "asc" } }),
    db.documento.findMany({ where: VIGENTES, orderBy: { criadoEm: "desc" }, take: 1000 }),
  ]);
  const candidatos: Candidato[] = vigentes.map((d) => ({
    id: d.id, tipo: d.tipo, escopo: d.escopo, fornecedorId: d.fornecedorId, fabricanteId: d.fabricanteId, produtoId: d.produtoId,
    rotulo: `${d.titulo}${d.numero ? ` · nº ${d.numero}` : ""} · ${d.validade ? `validade ${date(d.validade)}` : "sem vencimento"}`,
  }));

  // vindo de "Renovar" (?renovar=id): herda tipo, vínculo, título e órgão do documento anterior
  const ren = sp.renovar ? vigentes.find((d) => d.id === sp.renovar) : undefined;
  const inicial: Inicial = ren
    ? { tipo: ren.tipo, escopo: ren.escopo, fornecedorId: ren.fornecedorId ?? undefined, fabricanteId: ren.fabricanteId ?? undefined, produtoId: ren.produtoId ?? undefined, renovarId: ren.id, titulo: ren.titulo, orgaoEmissor: ren.orgaoEmissor ?? undefined }
    : {
        tipo: TIPOS.includes(sp.tipo as TipoDoc) ? (sp.tipo as TipoDoc) : undefined,
        escopo: ESCOPOS.includes(sp.escopo as EscopoDoc) ? (sp.escopo as EscopoDoc) : undefined,
        fornecedorId: sp.fornecedorId, fabricanteId: sp.fabricanteId, produtoId: sp.produtoId,
      };

  return (
    <>
      <PageHeader title={ren ? `Renovar: ${ROTULO_TIPO[ren.tipo]}` : "Novo documento"} subtitle={ren ? "O documento anterior será marcado como substituído e continua no histórico." : "Licenças, certificados, registros e contratos com alerta de vencimento."} />
      <Card title="Dados do documento" icon="escudo">
        <DocumentoNovoForm
          key={`${inicial.renovarId ?? ""}${inicial.escopo ?? ""}${inicial.fornecedorId ?? ""}${inicial.fabricanteId ?? ""}${inicial.produtoId ?? ""}`}
          fornecedores={fornecedores.map((f) => ({ value: f.id, label: f.nomeFantasia ?? f.razaoSocial }))}
          fabricantes={fabricantes.map((f) => ({ value: f.id, label: f.nome }))}
          produtos={produtos.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.descricao}` }))}
          candidatos={candidatos}
          inicial={inicial}
        />
      </Card>
    </>
  );
}
