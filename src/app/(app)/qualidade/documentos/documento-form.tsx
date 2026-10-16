"use client";

import { useMemo, useState } from "react";
import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { ESCOPOS, mesmoAlvo, ROTULO_ESCOPO, ROTULO_TIPO, TIPOS, type EscopoDoc, type TipoDoc } from "../_lib/documentos";
import { criarDocumentoAction, editarDocumentoAction } from "./actions";

type Opcao = { value: string; label: string };
/** Documentos vigentes que podem ser substituídos (do mais recente para o mais antigo). */
export type Candidato = { id: string; tipo: TipoDoc; escopo: EscopoDoc; fornecedorId: string | null; fabricanteId: string | null; produtoId: string | null; rotulo: string };

export type Inicial = {
  tipo?: TipoDoc;
  escopo?: EscopoDoc;
  fornecedorId?: string;
  fabricanteId?: string;
  produtoId?: string;
  renovarId?: string;
  titulo?: string;
  orgaoEmissor?: string;
};

export function DocumentoNovoForm({ fornecedores, fabricantes, produtos, candidatos, inicial }: { fornecedores: Opcao[]; fabricantes: Opcao[]; produtos: Opcao[]; candidatos: Candidato[]; inicial: Inicial }) {
  const [tipo, setTipo] = useState<string>(inicial.tipo ?? "");
  const [escopo, setEscopo] = useState<string>(inicial.escopo ?? "");
  const [fornecedorId, setFornecedorId] = useState(inicial.fornecedorId ?? "");
  const [fabricanteId, setFabricanteId] = useState(inicial.fabricanteId ?? "");
  const [produtoId, setProdutoId] = useState(inicial.produtoId ?? "");

  // candidatos à substituição: mesmo tipo, escopo e vínculo do que está sendo preenchido
  const iguais = useMemo(() => {
    if (!tipo || !escopo) return [];
    const alvo = { tipo, escopo: escopo as EscopoDoc, fornecedorId: escopo === "FORNECEDOR" ? fornecedorId || null : null, fabricanteId: escopo === "FABRICANTE" ? fabricanteId || null : null, produtoId: escopo === "PRODUTO" ? produtoId || null : null };
    if (escopo !== "EMPRESA" && !(alvo.fornecedorId || alvo.fabricanteId || alvo.produtoId)) return [];
    return candidatos.filter((c) => mesmoAlvo(c, alvo));
  }, [tipo, escopo, fornecedorId, fabricanteId, produtoId, candidatos]);

  const padrao = iguais.find((c) => c.id === inicial.renovarId)?.id ?? "";

  return (
    <Form action={criarDocumentoAction} submitLabel="Salvar documento">
      <Grid cols={3}>
        <Select label="Tipo *" name="tipo" required defaultValue={inicial.tipo} onChange={(e) => setTipo(e.target.value)} options={TIPOS.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))} />
        <Select label="Vale para *" name="escopo" required defaultValue={inicial.escopo} onChange={(e) => setEscopo(e.target.value)} options={ESCOPOS.map((s) => ({ value: s, label: ROTULO_ESCOPO[s] }))} />
        {escopo === "FORNECEDOR" && <Select label="Fornecedor *" name="fornecedorId" required defaultValue={inicial.fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} options={fornecedores} />}
        {escopo === "FABRICANTE" && <Select label="Fabricante *" name="fabricanteId" required defaultValue={inicial.fabricanteId} onChange={(e) => setFabricanteId(e.target.value)} options={fabricantes} />}
        {escopo === "PRODUTO" && <Select label="Produto *" name="produtoId" required defaultValue={inicial.produtoId} onChange={(e) => setProdutoId(e.target.value)} options={produtos} />}
      </Grid>
      <Grid cols={3}>
        <Field label="Título *" name="titulo" defaultValue={inicial.titulo} required maxLength={200} className="lg:col-span-2" placeholder="Ex.: AFE ANVISA da matriz" />
        <Field label="Número" name="numero" maxLength={80} />
        <Field label="Órgão emissor" name="orgaoEmissor" defaultValue={inicial.orgaoEmissor} maxLength={120} placeholder="ANVISA, Vigilância Sanitária..." />
        <Field label="Emissão" name="emissao" type="date" />
        <Field label="Validade" name="validade" type="date" hint="Deixe em branco se o documento não vence" />
      </Grid>
      {iguais.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-[13px] text-amber-800">
            Já existe(m) {iguais.length} documento(s) vigente(s) do mesmo tipo e vínculo. Se este é a renovação, escolha qual ele substitui: o anterior fica no histórico, marcado como substituído.
          </p>
          <Select key={iguais.map((c) => c.id).join(",")} label="Substitui o documento" name="substituiId" defaultValue={padrao} placeholder="Não substituir (manter os dois)" options={iguais.map((c) => ({ value: c.id, label: c.rotulo }))} />
        </div>
      )}
      <TextArea label="Observação" name="observacao" maxLength={1000} />
      <Field label="Arquivo (opcional)" name="arquivo" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hint="PDF, JPG ou PNG até 10 MB. Novas versões podem ser enviadas depois, no detalhe." />
    </Form>
  );
}

export type DadosEdicao = { id: string; tipo: TipoDoc; titulo: string; numero: string; orgaoEmissor: string; emissao: string; validade: string; observacao: string };

export function DocumentoEditarForm({ d }: { d: DadosEdicao }) {
  return (
    <Form action={editarDocumentoAction.bind(null, d.id, d.tipo)} redirectTo={`/qualidade/documentos/${d.id}`}>
      <Grid cols={3}>
        <Field label="Título *" name="titulo" defaultValue={d.titulo} required maxLength={200} className="lg:col-span-2" />
        <Field label="Número" name="numero" defaultValue={d.numero} maxLength={80} />
        <Field label="Órgão emissor" name="orgaoEmissor" defaultValue={d.orgaoEmissor} maxLength={120} />
        <Field label="Emissão" name="emissao" type="date" defaultValue={d.emissao} />
        <Field label="Validade" name="validade" type="date" defaultValue={d.validade} hint="Em branco = sem vencimento" />
      </Grid>
      <TextArea label="Observação" name="observacao" defaultValue={d.observacao} maxLength={1000} />
    </Form>
  );
}
