/** Orquestra a carga de demonstração numa única transação (tudo ou nada). Idempotente: o marcador é o produto COL-1001. */
import { db } from "@/lib/db";
import { hojeUTC } from "@/lib/datas";
import { criarCadastros, higienizar } from "./cadastros";
import { planejarCompras } from "./compras-plano";
import { executarFuturo, executarPassado, executarVendaDireta, guiaCir2, orcamentos } from "./comercial";
import type { Ctx } from "./ctx";
import { comprar } from "./estoque";
import { ajustesDeEstoque, documentos, inventario, pedidosAbertos, recolhimento } from "./extras";
import {
  ajustarSaldoInicial, avulsos, despesas, extrato, favorecidos, gerarOfx, pagamentos, pendentesDeClassificacao, prepararContas, recebimentos,
} from "./financeiro";
import { planejarFuturo, planejarHistorico, planejarVendasDiretas, type PlanoCirurgia } from "./plano";
import { addD, mulberry32 } from "./util";

function novoCtx(tx: Ctx["tx"], t0: Date): Ctx {
  return {
    tx, t0, hoje: hojeUTC(), rnd: mulberry32(4242), u: {} as Ctx["u"], prod: new Map(), forn: new Map(), hosp: new Map(), med: new Map(), conv: new Map(), rep: new Map(),
    proc: new Map(), centro: new Map(), plano: new Map(), contaId: "", caixaId: "", especiais: new Set(), receber: [], pagar: [], lancItau: [], notaFiscal: 18420, contagem: {},
  };
}

export async function carregarDemo() {
  const t0 = new Date(Date.now() - 60_000);
  if (process.env.NODE_ENV === "production") throw new Error("A carga de demonstração não pode rodar em produção.");

  if (await db.produto.findUnique({ where: { codigo: "SPN-1001" } })) {
    throw new Error("O banco tem a carga antiga (v2: trauma/quadril/joelho, produto SPN-1001). Restaure o backup e rode de novo; esta carga alinhada à SP OSTEOS não se soma a ela.");
  }
  if (await db.produto.findUnique({ where: { codigo: "COL-1001" } })) {
    await db.$transaction(async (tx) => higienizar(novoCtx(tx, t0)));
    console.log("Dados de demonstração já carregados (produto COL-1001 existe): nada a fazer além da higienização de nomes.");
    return;
  }
  const fechados = await db.fechamentoMes.count({ where: { mes: { gte: "2026-04" } } });
  if (fechados > 0) throw new Error("Há mês financeiro fechado a partir de 04/2026: reabra antes de carregar o histórico (a carga não fecha nem mexe em meses fechados).");

  let relatorio: Record<string, number> = {};
  let saldo = { inicial: 0, final: 0 };
  const saida: { ofx: Awaited<ReturnType<typeof gerarOfx>> } = { ofx: null };
  await db.$transaction(
    async (tx) => {
      const c = novoCtx(tx, t0);
      await higienizar(c);
      await criarCadastros(c);
      await prepararContas(c);

      const historico = planejarHistorico();
      const futuro = planejarFuturo();
      const vendas = planejarVendasDiretas();
      const compras = planejarCompras([...historico, ...futuro], vendas, c.hoje);
      type Evento = { t: Date; ordem: number; rodar: () => Promise<unknown> };
      const eventos: Evento[] = [
        ...compras.map((e) => ({ t: e.t, ordem: 0, rodar: () => comprar(c, e.opc) })),
        ...historico.map((p) => ({ t: addD(p.dia, -2), ordem: 1, rodar: () => executarPassado(c, p) })),
        ...vendas.map((v) => ({ t: v.dia, ordem: 1, rodar: () => executarVendaDireta(c, v) })),
        ...futuro.map((p: PlanoCirurgia) => ({ t: addD(p.dia, -2), ordem: 1, rodar: () => executarFuturo(c, p) })),
      ].sort((a, b) => a.t.getTime() - b.t.getTime() || a.ordem - b.ordem);
      for (const e of eventos) await e.rodar();

      await pedidosAbertos(c);
      await guiaCir2(c);
      await orcamentos(c);
      await avulsos(c);
      await despesas(c);
      await pendentesDeClassificacao(c);
      await recebimentos(c);
      await pagamentos(c);
      await favorecidos(c);
      await extrato(c);
      saldo = await ajustarSaldoInicial(c);
      await recolhimento(c);
      await ajustesDeEstoque(c);
      await inventario(c);
      await documentos(c);
      saida.ofx = await gerarOfx(c);
      await tx.logAuditoria.create({
        data: { usuarioId: c.u.admin.id, acao: "carga de demonstração", entidade: "Sistema", detalhes: `scripts/demo-dados.ts: ${Object.entries(c.contagem).map(([k, v]) => `${k} ${v}`).join("; ")}` },
      });
      relatorio = c.contagem;
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  );
  console.log("Carga de demonstração concluída:");
  for (const [k, v] of Object.entries(relatorio).sort()) console.log(`  ${k}: ${v}`);
  console.log(`Conta Itaú: saldo inicial ${saldo.inicial.toFixed(2)}, saldo final ${saldo.final.toFixed(2)}`);
  const ofx = saida.ofx;
  if (ofx) console.log(`OFX de demonstração: ${ofx.caminho} (crédito ${ofx.v1.toFixed(2)} do PV-2 e crédito ${ofx.v2.toFixed(2)} de "${ofx.titulo2}")`);
}
