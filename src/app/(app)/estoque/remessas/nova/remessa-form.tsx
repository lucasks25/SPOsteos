"use client";

import { useMemo, useState } from "react";
import { Form, Grid, Select, TextArea } from "@/components/form";
import { Table, Td, btn } from "@/components/ui";
import { date } from "@/lib/format";
import { ordenarFefo, sugerirFefo, type LoteDisp } from "../../_lib/fefo";
import { criarRemessaAction } from "../actions";

type ItemQtd = { produtoId: string; quantidade: number };
export type CirurgiaOpt = { id: string; label: string; hospitalId: string; itens: ItemQtd[] };
export type KitOpt = { id: string; label: string; itens: ItemQtd[] };
type ProdutoOpt = { id: string; codigo: string; descricao: string };
type Row = { key: string; produtoId: string; loteId: string; quantidade: number };

let seq = 0;
const novaChave = () => `r${++seq}`;

const inputCls =
  "h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 hover:border-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25";

/** Monta linhas por FEFO; linhas sem saldo ficam com lote vazio para o usuário resolver. */
function montar(lotes: LoteDisp[], itens: ItemQtd[], existentes: Row[] = []): Row[] {
  const usado = new Map<string, number>();
  for (const r of existentes) if (r.loteId) usado.set(r.loteId, (usado.get(r.loteId) ?? 0) + r.quantidade);
  const rows: Row[] = [];
  for (const it of itens) {
    const { linhas, faltante } = sugerirFefo(lotes, it.produtoId, it.quantidade, usado);
    for (const l of linhas) rows.push({ key: novaChave(), ...l });
    if (faltante > 0) rows.push({ key: novaChave(), produtoId: it.produtoId, loteId: "", quantidade: faltante });
  }
  return rows;
}

export function RemessaForm({
  hospitais,
  cirurgias,
  kits,
  produtos,
  lotes,
  cirurgiaInicial,
}: {
  hospitais: { value: string; label: string }[];
  cirurgias: CirurgiaOpt[];
  kits: KitOpt[];
  produtos: ProdutoOpt[];
  lotes: LoteDisp[];
  cirurgiaInicial?: string;
}) {
  const cirInicial = cirurgias.find((c) => c.id === cirurgiaInicial);
  const [hospitalId, setHospitalId] = useState(cirInicial?.hospitalId ?? "");
  const [cirurgiaId, setCirurgiaId] = useState(cirInicial?.id ?? "");
  const [kitId, setKitId] = useState("");
  const [rows, setRows] = useState<Row[]>(() => (cirInicial ? montar(lotes, cirInicial.itens) : []));
  const [addProduto, setAddProduto] = useState("");
  const [addQtd, setAddQtd] = useState(1);

  const produtoMap = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const lotesPorProduto = useMemo(() => {
    const m = new Map<string, LoteDisp[]>();
    for (const l of ordenarFefo(lotes)) m.set(l.produtoId, [...(m.get(l.produtoId) ?? []), l]);
    return m;
  }, [lotes]);
  const loteMap = useMemo(() => new Map(lotes.map((l) => [l.loteId, l])), [lotes]);

  const usadoPorLote = new Map<string, number>();
  for (const r of rows) if (r.loteId) usadoPorLote.set(r.loteId, (usadoPorLote.get(r.loteId) ?? 0) + r.quantidade);

  const cirurgiasFiltradas = hospitalId ? cirurgias.filter((c) => c.hospitalId === hospitalId) : cirurgias;
  const pendentes = rows.filter((r) => !r.loteId || r.quantidade <= 0).length;
  const excedidos = [...usadoPorLote].filter(([id, q]) => q > (loteMap.get(id)?.disponivel ?? 0)).length;
  const itensJson = JSON.stringify(rows.map(({ produtoId, loteId, quantidade }) => ({ produtoId, loteId, quantidade })));

  function onHospital(id: string) {
    setHospitalId(id);
    const cir = cirurgias.find((c) => c.id === cirurgiaId);
    if (cir && cir.hospitalId !== id) setCirurgiaId("");
  }
  function onCirurgia(id: string) {
    setCirurgiaId(id);
    const cir = cirurgias.find((c) => c.id === id);
    if (!cir) return;
    setHospitalId(cir.hospitalId);
    if (!kitId && cir.itens.length > 0 && (rows.length === 0 || window.confirm("Substituir os itens pelos materiais padrão do procedimento?"))) {
      setRows(montar(lotes, cir.itens));
    }
  }
  function onKit(id: string) {
    setKitId(id);
    const kit = kits.find((k) => k.id === id);
    if (!kit) return;
    if (rows.length === 0 || window.confirm("Substituir os itens pelos itens do kit?")) setRows(montar(lotes, kit.itens));
  }
  function adicionar() {
    if (!addProduto || addQtd <= 0) return;
    setRows([...rows, ...montar(lotes, [{ produtoId: addProduto, quantidade: addQtd }], rows)]);
    setAddProduto("");
    setAddQtd(1);
  }
  function atualizar(key: string, patch: Partial<Row>) {
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <Form action={criarRemessaAction} submitLabel="Criar remessa">
      <input type="hidden" name="itens" value={itensJson} />
      <Grid cols={3}>
        <Select label="Hospital *" name="hospitalId" value={hospitalId} onChange={(e) => onHospital(e.target.value)} options={hospitais} required />
        <Select
          label="Cirurgia (opcional)"
          name="cirurgiaId"
          value={cirurgiaId}
          onChange={(e) => onCirurgia(e.target.value)}
          options={cirurgiasFiltradas.map((c) => ({ value: c.id, label: c.label }))}
          placeholder="Sem cirurgia vinculada"
          hint="Preenche os materiais padrão do procedimento"
        />
        <Select
          label="Kit / caixa (opcional)"
          name="kitId"
          value={kitId}
          onChange={(e) => onKit(e.target.value)}
          options={kits.map((k) => ({ value: k.id, label: k.label }))}
          placeholder="Sem kit"
          hint="Preenche os itens do kit"
        />
      </Grid>

      <div>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <label className="block min-w-64 flex-1">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Adicionar produto</span>
            <select aria-label="Produto a adicionar" value={addProduto} onChange={(e) => setAddProduto(e.target.value)} className={inputCls}>
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.descricao} ({(lotesPorProduto.get(p.id) ?? []).reduce((s, l) => s + l.disponivel, 0)} disp.)
                </option>
              ))}
            </select>
          </label>
          <label className="block w-24">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-slate-700">Qtd.</span>
            <input aria-label="Quantidade a adicionar" type="number" min={1} value={addQtd} onChange={(e) => setAddQtd(Number(e.target.value))} className={inputCls} />
          </label>
          <button type="button" onClick={adicionar} className={btn.secondary}>Adicionar produto (lote que vence primeiro)</button>
        </div>

        <Table
          titulo="Itens da remessa"
          contagem={rows.length}
          head={["Produto", "Lote (validade — disponível)", "Qtd.", <span key="a" className="sr-only">Ações</span>]}
          empty={rows.length === 0}
          emptyText="Nenhum item. Escolha uma cirurgia, um kit ou adicione produtos."
        >
              {rows.map((r) => {
                const p = produtoMap.get(r.produtoId);
                const opcoes = lotesPorProduto.get(r.produtoId) ?? [];
                const lote = r.loteId ? loteMap.get(r.loteId) : undefined;
                const excede = lote ? (usadoPorLote.get(lote.loteId) ?? 0) > lote.disponivel : false;
                return (
                  <tr key={r.key}>
                    <Td className="whitespace-normal">
                      <span className="font-mono text-xs text-slate-600">{p?.codigo}</span> {p?.descricao ?? r.produtoId}
                    </Td>
                    <Td className="min-w-72 whitespace-normal">
                      <select aria-label={`Lote de ${p?.descricao ?? "produto"}`} value={r.loteId} onChange={(e) => atualizar(r.key, { loteId: e.target.value })} className={inputCls}>
                        <option value="">{opcoes.length === 0 ? "Sem lote disponível" : "Selecione o lote..."}</option>
                        {opcoes.map((l) => (
                          <option key={l.loteId} value={l.loteId}>
                            {l.numero} — val. {date(l.validade)} — {l.disponivel} disp.
                          </option>
                        ))}
                      </select>
                      {!r.loteId && <span className="mt-1 block text-xs text-rose-600">Sem saldo liberado suficiente — escolha um lote ou remova.</span>}
                      {excede && <span className="mt-1 block text-xs text-rose-600">Quantidade total do lote excede o disponível.</span>}
                    </Td>
                    <Td className="w-28 text-right">
                      <input
                        aria-label={`Quantidade de ${p?.descricao ?? "produto"}`}
                        type="number"
                        min={1}
                        value={r.quantidade}
                        onChange={(e) => atualizar(r.key, { quantidade: Number(e.target.value) })}
                        className={`${inputCls} text-right`}
                      />
                    </Td>
                    <Td className="text-right">
                      <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className={btn.small}>
                        Remover
                      </button>
                    </Td>
                  </tr>
                );
              })}
        </Table>
        {(pendentes > 0 || excedidos > 0) && (
          <p role="status" className="mt-2 text-xs text-amber-700">
            {pendentes > 0 && `${pendentes} item(ns) sem lote/quantidade. `}
            {excedidos > 0 && `${excedidos} lote(s) acima do disponível.`}
          </p>
        )}
      </div>

      <TextArea label="Observação" name="observacao" />
    </Form>
  );
}
