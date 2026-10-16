import "server-only";
import { hojeUTC } from "../../financeiro/_lib/datas";
import { curvaAbc } from "./abc";
import { carregarGlosasRelatorio, carregarEntradasGiro, carregarPedidosFaturados, carregarSaldosLote, carregarVendasMeses } from "./dados";
import { calcularGiro, PRAZO_REPOSICAO_PADRAO, type SituacaoGiro } from "./giro";
import { margens } from "./margens";
import { periodoDe } from "./periodo";
import { lotesEmRisco, riscoPorHospital, totaisPorFaixa } from "./vencimentos";
import { mesBrasilia, vendasPorMes } from "./vendas-mes";
import { addDias, parseDia } from "../../financeiro/_lib/datas";
import { CATEGORIAS_GLOSA } from "../../financeiro/_lib/glosa-categorias";
import { resumirGlosas } from "./glosas";

/** searchParams da página ou da rota de exportação. */
export type SP = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** Os relatórios com período e filtros usam a mesma leitura na tela e no CSV. */
export async function abcDados(sp: SP) {
  const periodo = periodoDe(sp.de, sp.ate, hojeUTC());
  const hospitalId = um(sp.hospital);
  const pedidos = await carregarPedidosFaturados({ ...periodo, hospitalId });
  const m = margens(pedidos);
  const abc = curvaAbc(m.produtos.map((p) => ({ id: p.id, codigo: p.sub, nome: p.nome, valor: p.receita, quantidade: p.quantidade })));
  return { periodo, hospitalId, pedidos: pedidos.length, abc };
}

export async function margemDados(sp: SP) {
  const periodo = periodoDe(sp.de, sp.ate, hojeUTC(), 30);
  const hospitalId = um(sp.hospital);
  const representanteId = um(sp.representante);
  const pedidos = await carregarPedidosFaturados({ ...periodo, hospitalId, representanteId });
  return { periodo, hospitalId, representanteId, ...margens(pedidos) };
}

export const SITUACOES: SituacaoGiro[] = ["RUPTURA", "EXCESSO", "SEM_MOVIMENTO", "OK"];

export async function giroDados(sp: SP) {
  const agora = new Date();
  const prazoN = Number(um(sp.prazo));
  const prazo = Number.isInteger(prazoN) && prazoN >= 0 && prazoN <= 365 ? prazoN : PRAZO_REPOSICAO_PADRAO;
  const situacao = SITUACOES.find((s) => s === um(sp.situacao));
  const todas = (await carregarEntradasGiro(agora))
    // produto sem estoque, sem consumo e sem mínimo não entra: não há o que acompanhar
    .filter((e) => e.deposito + e.consignado + e.quarentena + e.naoConforme > 0 || e.consumo > 0 || e.estoqueMinimo > 0)
    .map((e) => calcularGiro(e, agora, prazo));
  const linhas = situacao ? todas.filter((l) => l.situacao === situacao) : todas;
  const conta = (s: SituacaoGiro) => todas.filter((l) => l.situacao === s);
  return {
    prazo,
    situacao,
    linhas,
    todas: todas.length,
    ruptura: conta("RUPTURA"),
    excesso: conta("EXCESSO"),
    semMovimento: conta("SEM_MOVIMENTO"),
    valorTotal: todas.reduce((s, l) => s + Math.round(l.valor * 100), 0) / 100,
    valorExcesso: conta("EXCESSO").concat(conta("SEM_MOVIMENTO")).reduce((s, l) => s + Math.round(l.valor * 100), 0) / 100,
  };
}

export async function vencimentosDados() {
  const hoje = hojeUTC();
  const linhas = lotesEmRisco(await carregarSaldosLote(addDias(hoje, 180)), hoje);
  return { hoje, linhas, totais: totaisPorFaixa(linhas), hospitais: riscoPorHospital(linhas) };
}

export async function vendasDados(sp: SP) {
  const hospitalId = um(sp.hospital);
  const fim = mesBrasilia(new Date());
  const meses = vendasPorMes(await carregarVendasMeses(fim, hospitalId), fim);
  const soma = (f: (m: (typeof meses)[number]) => number) => meses.reduce((s, m) => s + Math.round(f(m) * 100), 0) / 100;
  const total = soma((m) => m.valor);
  const anterior = soma((m) => m.anterior);
  return { hospitalId, meses, total, anterior, variacaoPct: anterior > 0 ? Math.round(((total - anterior) / anterior) * 10000) / 100 : null, pedidos: meses.reduce((s, m) => s + m.pedidos, 0) };
}

export async function glosasDados(sp: SP) {
  const periodo = periodoDe(sp.de, sp.ate, hojeUTC(), 90);
  const hospitalId = um(sp.hospital);
  const convenioId = um(sp.convenio);
  const categoria = CATEGORIAS_GLOSA.find((c) => c === um(sp.categoria));
  const { faturados, glosas } = await carregarGlosasRelatorio({ gte: periodo.gte, lt: periodo.lt, de: parseDia(periodo.de)!, ate: parseDia(periodo.ate)!, hospitalId, convenioId, categoria });
  return { periodo, hospitalId, convenioId, categoria, pedidos: faturados.length, ...resumirGlosas(faturados, glosas) };
}
