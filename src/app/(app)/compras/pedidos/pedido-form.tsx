"use client";

import { useMemo, useState } from "react";
import { Field, Form, Grid, Select, TextArea } from "@/components/form";
import { btn } from "@/components/ui";
import { money } from "@/lib/format";
import { criarPedidoCompra } from "./actions";

type ProdutoOpt = { id: string; codigo: string; descricao: string; custoMedio: number };
type Row = { key: string; produtoId: string; quantidade: number; custoUnit: number };

let seq = 0;
const inputCls =
  "h-8 w-full rounded border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25";

export function PedidoCompraForm({ fornecedores, produtos, fornecedorInicial, itensIniciais }: {
  fornecedores: { value: string; label: string }[];
  produtos: ProdutoOpt[];
  fornecedorInicial?: string;
  itensIniciais?: { produtoId: string; quantidade: number }[];
}) {
  const mapa = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const [importacao, setImportacao] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    (itensIniciais ?? []).filter((i) => mapa.has(i.produtoId)).map((i) => ({ key: `i${++seq}`, produtoId: i.produtoId, quantidade: i.quantidade, custoUnit: mapa.get(i.produtoId)!.custoMedio })),
  );
  const [addProduto, setAddProduto] = useState("");
  const [addQtd, setAddQtd] = useState(1);

  const total = rows.reduce((s, r) => s + r.quantidade * r.custoUnit, 0);
  const itensJson = JSON.stringify(rows.map(({ produtoId, quantidade, custoUnit }) => ({ produtoId, quantidade, custoUnit })));
  const atualizar = (key: string, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function adicionar() {
    const p = mapa.get(addProduto);
    if (!p || addQtd < 1) return;
    setRows([...rows, { key: `i${++seq}`, produtoId: p.id, quantidade: addQtd, custoUnit: p.custoMedio }]);
    setAddProduto("");
    setAddQtd(1);
  }

  return (
    <Form action={criarPedidoCompra} submitLabel="Criar pedido">
      <input type="hidden" name="itens" value={itensJson} />
      <Grid cols={3}>
        <Select label="Fornecedor *" name="fornecedorId" options={fornecedores} defaultValue={fornecedorInicial ?? ""} required />
        <Field label="Previsão de entrega" name="previsao" type="date" />
        <Field label="Importação (invoice / DI)" name="importacao" type="checkbox" checked={importacao} onChange={(e) => setImportacao(e.target.checked)} className="self-end pb-2" />
        {importacao && (
          <>
            <Field label="Invoice" name="invoice" maxLength={60} />
            <Field label="Nº da DI" name="numeroDi" maxLength={30} />
          </>
        )}
      </Grid>
      <TextArea label="Observação" name="observacao" maxLength={500} />

      <div>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <label className="block min-w-64 flex-1">
            <span className="mb-1 block text-xs text-slate-700">Adicionar produto</span>
            <select value={addProduto} onChange={(e) => setAddProduto(e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.descricao}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-24">
            <span className="mb-1 block text-xs text-slate-700">Qtd.</span>
            <input type="number" min={1} value={addQtd} onChange={(e) => setAddQtd(Number(e.target.value))} className={`${inputCls} text-right`} />
          </label>
          <button type="button" onClick={adicionar} className={btn.secondary}>
            Adicionar
          </button>
        </div>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-[13px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-[.04em] text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Produto</th>
                <th scope="col" className="w-28 px-3 py-2 text-right">Qtd.</th>
                <th scope="col" className="w-36 px-3 py-2 text-right">Custo unit. (R$)</th>
                <th scope="col" className="px-3 py-2 text-right">Subtotal</th>
                <th scope="col" className="w-20"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 [&>tr]:h-9">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    Nenhum item. O custo padrão é o custo médio do produto.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const p = mapa.get(r.produtoId);
                return (
                  <tr key={r.key}>
                    <td className="px-3 py-1.5">{p ? `${p.codigo} — ${p.descricao}` : r.produtoId}</td>
                    <td className="px-3 py-1.5">
                      <input type="number" min={1} aria-label={`Quantidade de ${p?.descricao ?? "item"}`} value={r.quantidade} onChange={(e) => atualizar(r.key, { quantidade: Number(e.target.value) })} className={`${inputCls} text-right`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" min={0} step="0.01" aria-label={`Custo unitário de ${p?.descricao ?? "item"}`} value={r.custoUnit} onChange={(e) => atualizar(r.key, { custoUnit: Number(e.target.value) })} className={`${inputCls} text-right`} />
                    </td>
                    <td className="px-3 py-1.5 text-right tnum">{money(r.quantidade * r.custoUnit)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="inline-flex h-7 items-center rounded px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={3} className="px-3 py-1.5 text-right">
                    Total do pedido
                  </td>
                  <td className="px-3 py-1.5 text-right tnum">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Form>
  );
}
