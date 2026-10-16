"use client";

import { useMemo, useState } from "react";
import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { btn } from "@/components/ui";
import { salvarAutorizacao } from "../autorizacao-actions";

export type ProdutoOpt = { id: string; codigo: string; descricao: string };
export type ItemGuia = { produtoId: string; quantidadeSolicitada: number; quantidadeAutorizada: number; valorAutorizado: number | null };
export type GuiaInicial = {
  id: string;
  numeroGuia: string;
  senha: string;
  status: string;
  solicitadaEm: string;
  autorizadaEm: string;
  validade: string;
  observacao: string;
  itens: ItemGuia[];
};

type Row = ItemGuia & { key: string };
let seq = 0;
const inputCls =
  "h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25";

const STATUS = [
  { value: "SOLICITADA", label: "Solicitada (aguardando o convênio)" },
  { value: "AUTORIZADA", label: "Autorizada" },
  { value: "PARCIAL", label: "Autorizada parcialmente" },
  { value: "NEGADA", label: "Negada" },
  { value: "EXPIRADA", label: "Expirada" },
];

/** Formulário da guia: dados do convênio + editor de itens (produto, solicitado, autorizado, valor). Os itens vão como JSON num campo oculto. */
export function AutorizacaoForm({
  cirurgiaId,
  produtos,
  sugestao,
  hoje,
  guia,
}: {
  cirurgiaId: string;
  produtos: ProdutoOpt[];
  /** itens do procedimento/kit/consumo para pré-preencher uma guia nova */
  sugestao: { produtoId: string; quantidade: number }[];
  hoje: string;
  guia?: GuiaInicial;
}) {
  const mapa = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const [status, setStatus] = useState(guia?.status ?? "SOLICITADA");
  const [rows, setRows] = useState<Row[]>(() =>
    (guia?.itens ?? sugestao.map((s) => ({ produtoId: s.produtoId, quantidadeSolicitada: s.quantidade, quantidadeAutorizada: 0, valorAutorizado: null })))
      .filter((i) => mapa.has(i.produtoId))
      .map((i) => ({ ...i, key: `i${++seq}` })),
  );
  const [addProduto, setAddProduto] = useState("");
  const [addQtd, setAddQtd] = useState(1);
  const comAutorizacao = status === "AUTORIZADA" || status === "PARCIAL";
  const itensJson = JSON.stringify(rows.map(({ produtoId, quantidadeSolicitada, quantidadeAutorizada, valorAutorizado }) => ({ produtoId, quantidadeSolicitada, quantidadeAutorizada: comAutorizacao || status === "EXPIRADA" ? quantidadeAutorizada : 0, valorAutorizado })));
  const atualizar = (key: string, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // ao marcar "autorizada", copia o solicitado onde ainda não há quantidade autorizada (o convênio costuma aprovar tudo)
  function mudarStatus(v: string) {
    setStatus(v);
    if (v === "AUTORIZADA") setRows(rows.map((r) => (r.quantidadeAutorizada === 0 ? { ...r, quantidadeAutorizada: r.quantidadeSolicitada } : r)));
  }

  function adicionar() {
    if (!addProduto || addQtd < 1 || rows.some((r) => r.produtoId === addProduto)) return;
    setRows([...rows, { key: `i${++seq}`, produtoId: addProduto, quantidadeSolicitada: addQtd, quantidadeAutorizada: 0, valorAutorizado: null }]);
    setAddProduto("");
    setAddQtd(1);
  }

  return (
    <Form action={salvarAutorizacao.bind(null, cirurgiaId, guia?.id ?? null)} submitLabel={guia ? "Salvar guia" : "Registrar guia"} resetOnSuccess={!guia}>
      <input type="hidden" name="itens" value={itensJson} />
      <Grid cols={3}>
        <Field label="Nº da guia" name="numeroGuia" defaultValue={guia?.numeroGuia} maxLength={40} />
        <Field label="Senha / código de autorização" name="senha" defaultValue={guia?.senha} maxLength={40} />
        <Select label="Situação *" name="status" required options={STATUS} value={status} onChange={(e) => mudarStatus(e.target.value)} placeholder="" />
        <Field label="Solicitada em *" name="solicitadaEm" type="date" defaultValue={guia?.solicitadaEm ?? hoje} max={hoje} required />
        <Field label={comAutorizacao ? "Autorizada em *" : "Autorizada em"} name="autorizadaEm" type="date" defaultValue={guia?.autorizadaEm ?? ""} max={hoje} required={comAutorizacao} />
        <Field label="Validade" name="validade" type="date" defaultValue={guia?.validade ?? ""} hint="Último dia em que a autorização vale" />
      </Grid>
      <TextArea label="Observação" name="observacao" defaultValue={guia?.observacao} maxLength={500} />

      <div>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <label className="block min-w-64 flex-1">
            <span className="mb-1 block text-xs text-slate-700">Adicionar item à guia</span>
            <select value={addProduto} onChange={(e) => setAddProduto(e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {produtos.filter((p) => !rows.some((r) => r.produtoId === p.id)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.descricao}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-24">
            <span className="mb-1 block text-xs text-slate-700">Solicitado</span>
            <input type="number" min={1} value={addQtd} onChange={(e) => setAddQtd(Number(e.target.value))} className={`${inputCls} text-right`} />
          </label>
          <button type="button" onClick={adicionar} className={btn.secondary}>
            Adicionar
          </button>
        </div>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[.04em] text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Produto</th>
                <th scope="col" className="w-28 px-3 py-2 text-right">Solicitado</th>
                <th scope="col" className="w-28 px-3 py-2 text-right">Autorizado</th>
                <th scope="col" className="w-36 px-3 py-2 text-right">Valor autorizado (R$)</th>
                <th scope="col" className="w-20"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 [&>tr]:h-9">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum item na guia. Inclua os materiais solicitados ao convênio.</td>
                </tr>
              )}
              {rows.map((r) => {
                const p = mapa.get(r.produtoId);
                return (
                  <tr key={r.key}>
                    <td className="px-3 py-1.5">{p ? `${p.codigo} — ${p.descricao}` : r.produtoId}</td>
                    <td className="px-3 py-1.5">
                      <input type="number" min={1} aria-label={`Quantidade solicitada de ${p?.descricao ?? "item"}`} value={r.quantidadeSolicitada} onChange={(e) => atualizar(r.key, { quantidadeSolicitada: Number(e.target.value) })} className={`${inputCls} text-right`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" min={0} disabled={status === "SOLICITADA" || status === "NEGADA"} aria-label={`Quantidade autorizada de ${p?.descricao ?? "item"}`} value={status === "SOLICITADA" || status === "NEGADA" ? 0 : r.quantidadeAutorizada} onChange={(e) => atualizar(r.key, { quantidadeAutorizada: Number(e.target.value) })} className={`${inputCls} text-right disabled:bg-slate-50 disabled:text-slate-500`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" min={0} step="0.01" disabled={status === "SOLICITADA" || status === "NEGADA"} aria-label={`Valor autorizado de ${p?.descricao ?? "item"}`} value={r.valorAutorizado ?? ""} onChange={(e) => atualizar(r.key, { valorAutorizado: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputCls} text-right disabled:bg-slate-50`} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="inline-flex h-7 items-center rounded px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Form>
  );
}
