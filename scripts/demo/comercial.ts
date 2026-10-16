/** Execução das cirurgias planejadas (vale, consumo, faturamento, NF) e orçamentos, pelos serviços reais. */
import { cancelarCirurgiaTx, confirmarCirurgiaTx, salvarCirurgiaTx } from "@/app/(app)/comercial/_lib/cirurgia-servico";
import { faturarCirurgia } from "@/app/(app)/comercial/_lib/faturamento";
import { registrarNfTx } from "@/app/(app)/comercial/_lib/nf";
import { salvarAutorizacaoTx } from "@/app/(app)/comercial/_lib/autorizacao-servico";
import { conferirRemessa, criarRemessa, enviarRemessa } from "@/app/(app)/estoque/_lib/remessas";
import { LOCAIS, movimentar } from "@/lib/estoque";
import { precosDoHospital } from "@/app/(app)/comercial/_lib/precos";
import { conta, redatarMovs, type Ctx } from "./ctx";
import { garantirDisponivel, infoProduto, pegarLotes, type Linha } from "./estoque";
import type { PlanoCirurgia, PlanoVenda } from "./plano";
import { addD, diaSemana, diaUtil, entre, hora, r2 } from "./util";

const diaUtilAnterior = (d: Date) => {
  let x = addD(d, -1);
  while (diaSemana(x) === 0 || diaSemana(x) === 6) x = addD(x, -1);
  return x;
};

async function novaCirurgia(c: Ctx, p: PlanoCirurgia) {
  const h = c.hosp.get(p.hosp)!;
  const proc = c.proc.get(p.proc)!;
  const { cirurgia } = await salvarCirurgiaTx(c.tx, null, {
    dataHora: hora(p.dia, p.h, p.min), hospitalId: h.id, medicoId: c.med.get(p.med)!, convenioId: p.conv ? c.conv.get(p.conv)! : null,
    procedimentoId: proc.id, representanteId: c.rep.get(p.rep)!, paciente: p.paciente, carteirinha: p.carteirinha, sus: p.sus, observacao: null,
  });
  const criada = p.destino.startsWith("FUTURA") ? addD(c.hoje, -entre(c.rnd, 2, 9)) : addD(p.dia, -entre(c.rnd, 4, 10));
  await c.tx.cirurgia.update({ where: { id: cirurgia.id }, data: { criadoEm: hora(criada, 10, 15) } });
  conta(c, "Cirurgia", 1);
  return cirurgia;
}

async function linhasDoPlano(c: Ctx, p: PlanoCirurgia, quando: Date): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (const it of p.itens) {
    await garantirDisponivel(c, it.cod, it.enviar, quando);
    linhas.push(...(await pegarLotes(c, it.cod, it.enviar)));
  }
  return linhas;
}

async function guia(c: Ctx, cirurgiaId: string, p: PlanoCirurgia, status: "AUTORIZADA" | "SOLICITADA" | "NEGADA", itens: { cod: string; qtd: number }[], solicitada: Date) {
  const lista = [];
  let reduzido = !p.autorizaMenos;
  for (const it of itens) {
    const info = await infoProduto(c, it.cod);
    let aut = it.qtd;
    if (!reduzido && it.qtd >= 2) { aut = it.qtd - 1; reduzido = true; }
    lista.push({ produtoId: info.id, quantidadeSolicitada: it.qtd, quantidadeAutorizada: aut });
  }
  const g = await salvarAutorizacaoTx(c.tx, {
    cirurgiaId, numeroGuia: `G${entre(c.rnd, 20260000, 20269999)}`, senha: status === "AUTORIZADA" ? String(entre(c.rnd, 100000, 999999)) : null, status, solicitadaEm: solicitada,
    autorizadaEm: status === "AUTORIZADA" ? addD(solicitada, 2) : null, validade: addD(solicitada, 40), itens: lista,
    observacao: status === "NEGADA" ? "Negada: aguardando relatório médico complementar." : null,
  });
  await c.tx.autorizacaoConvenio.update({ where: { id: g.id }, data: { criadoEm: hora(solicitada, 11) } });
  conta(c, "Guia de autorização", 1);
}

/** Cirurgia do passado: agenda, confirma, vale (envio + conferência), guia, faturamento e NF. */
export async function executarPassado(c: Ctx, p: PlanoCirurgia) {
  const { tx } = c;
  const cir = await novaCirurgia(c, p);
  if (p.destino === "CANCELADA") {
    await cancelarCirurgiaTx(tx, cir.id);
    await tx.cirurgia.update({ where: { id: cir.id }, data: { observacao: "Cancelada a pedido do paciente (adiou o procedimento)." } });
    return;
  }
  await confirmarCirurgiaTx(tx, cir.id);
  const h = c.hosp.get(p.hosp)!;
  const linhas = await linhasDoPlano(c, p, p.dia);
  const rem = await criarRemessa(tx, { hospitalId: h.id, cirurgiaId: cir.id, itens: linhas, observacao: null });
  const envio = diaUtilAnterior(p.dia);
  await tx.remessa.update({ where: { id: rem.id }, data: { criadoEm: hora(addD(envio, -1), 15) } });
  await enviarRemessa(tx, rem.id, c.u.estoque.nome);
  await tx.remessa.update({ where: { id: rem.id }, data: { enviadaEm: hora(envio, 10) } });
  await redatarMovs(c, hora(envio, 10, 5));

  const itensRem = await tx.remessaItem.findMany({ where: { remessaId: rem.id } });
  const resta = new Map<string, { cons: number; dev: number }>();
  for (const it of p.itens) resta.set((await infoProduto(c, it.cod)).id, { cons: it.qtd, dev: it.enviar - it.qtd - it.deixar });
  const retornos = itensRem.map((i) => {
    const r = resta.get(i.produtoId)!;
    const consumido = Math.min(i.quantidade, r.cons);
    r.cons -= consumido;
    const devolvido = Math.min(i.quantidade - consumido, r.dev);
    r.dev -= devolvido;
    return { itemId: i.id, devolvido, consumido };
  });
  await conferirRemessa(tx, rem.id, retornos, c.u.estoque.nome);
  await tx.remessa.update({ where: { id: rem.id }, data: { conferidaEm: hora(p.dia, 19) } });
  await redatarMovs(c, hora(p.dia, 19, 5));
  conta(c, "Remessa conferida", 1);

  if (p.conv && p.conv !== "SUS") await guia(c, cir.id, p, "AUTORIZADA", p.itens.map((i) => ({ cod: i.cod, qtd: i.qtd })), addD(p.dia, -7));

  if (p.destino === "REALIZADA") return;
  const nfDia = diaUtil(addD(p.dia, entre(c.rnd, 1, 3)));
  const pedido = await faturarCirurgia(tx, cir.id);
  await tx.pedidoVenda.update({ where: { id: pedido.id }, data: { criadoEm: hora(nfDia, 9), centroCustoId: c.centro.get(c.proc.get(p.proc)!.def.centro)! } });
  conta(c, "Pedido de venda", 1);
  if (p.destino === "PEDIDO_ABERTO") return;
  const venc = addD(nfDia, h.def.prazo);
  const cr = await registrarNfTx(tx, pedido.id, String(c.notaFiscal++), venc, hora(nfDia, 11));
  await tx.contaReceber.update({ where: { id: cr.id }, data: { criadoEm: hora(nfDia, 11, 5) } });
  c.receber.push({ id: cr.id, valor: Number(cr.valor.toString()), vencimento: venc, nfDia, hospKey: p.hosp, convenio: !!p.conv && p.conv !== "SUS", glosa: p.autorizaMenos });
  conta(c, "NF registrada (conta a receber)", 1);
}

/** Cirurgia futura (agenda): confirmada ou não, com vale ABERTO/ENVIADO conforme o plano e guia em vários estados. */
export async function executarFuturo(c: Ctx, p: PlanoCirurgia) {
  const { tx } = c;
  const cir = await novaCirurgia(c, p);
  if (p.confirmada) await confirmarCirurgiaTx(tx, cir.id);
  const h = c.hosp.get(p.hosp)!;
  if (p.destino === "FUTURA_ENVIADA" || p.destino === "FUTURA_ABERTA") {
    const linhas = await linhasDoPlano(c, p, addD(c.hoje, -2));
    const rem = await criarRemessa(tx, { hospitalId: h.id, cirurgiaId: cir.id, itens: linhas, observacao: null });
    await tx.remessa.update({ where: { id: rem.id }, data: { criadoEm: hora(addD(c.hoje, -2), 16) } });
    if (p.destino === "FUTURA_ENVIADA") {
      await enviarRemessa(tx, rem.id, c.u.estoque.nome);
      await tx.remessa.update({ where: { id: rem.id }, data: { enviadaEm: hora(addD(c.hoje, -1), 17) } });
      await redatarMovs(c, hora(addD(c.hoje, -1), 17, 5));
      conta(c, "Remessa enviada (aguardando conferência)", 1);
    } else conta(c, "Remessa aberta", 1);
  }
  if (p.conv && p.conv !== "SUS" && p.auth !== "NENHUMA") {
    await guia(c, cir.id, { ...p, autorizaMenos: false }, p.auth, p.itens.map((i) => ({ cod: i.cod, qtd: i.qtd })), addD(c.hoje, -4));
  }
}

/** Guia AUTORIZADA para a CIR-2 (já faturada), que apareceria com risco de glosa. */
export async function guiaCir2(c: Ctx) {
  const cir = await c.tx.cirurgia.findFirst({ where: { numero: 2 }, include: { consumos: true, autorizacoes: { select: { id: true } }, convenio: true } });
  if (!cir || cir.autorizacoes.length > 0) return;
  let convId = cir.convenioId;
  if (!convId) {
    convId = c.conv.get("Paulista Saúde Integral") ?? null;
    if (convId) await c.tx.cirurgia.update({ where: { id: cir.id }, data: { convenioId: convId, carteirinha: cir.carteirinha ?? "774120398801" } });
  }
  if (!convId || cir.consumos.length === 0) return;
  const porProd = new Map<string, number>();
  for (const k of cir.consumos) porProd.set(k.produtoId, (porProd.get(k.produtoId) ?? 0) + k.quantidade);
  const dh = cir.dataHora;
  const solic = new Date(Date.UTC(dh.getUTCFullYear(), dh.getUTCMonth(), dh.getUTCDate() - 7));
  const g = await salvarAutorizacaoTx(c.tx, {
    cirurgiaId: cir.id, numeroGuia: "G20267741", senha: "558210", status: "AUTORIZADA", solicitadaEm: solic, autorizadaEm: addD(solic, 2), validade: addD(solic, 40),
    itens: [...porProd].map(([produtoId, q]) => ({ produtoId, quantidadeSolicitada: q, quantidadeAutorizada: q })),
  });
  await c.tx.autorizacaoConvenio.update({ where: { id: g.id }, data: { criadoEm: hora(solic, 11) } });
  conta(c, "Guia de autorização", 1);
}

/** Orçamentos em vários estados (2 enviados aguardando resposta). */
export async function orcamentos(c: Ctx) {
  const defs: { hosp: string; conv: string | null; pac: string; status: "ENVIADO" | "APROVADO" | "RECUSADO" | "RASCUNHO"; dias: number; itens: [string, number][] }[] = [
    { hosp: "SGAB", conv: "Mediplan Assistência Médica", pac: "Marta Queiroz Teixeira", status: "ENVIADO", dias: 3, itens: [["COL-1002", 4], ["COL-1004", 2], ["COL-1007", 1]] },
    { hosp: "SAND", conv: "Previmed Seguros Saúde", pac: "Osvaldo Camargo Leite", status: "ENVIADO", dias: 1, itens: [["COL-1008", 1], ["COL-1010", 1], ["BIO-2004", 1]] },
    { hosp: "VAUR", conv: "Vida Plena Saúde", pac: "Helena Moraes Guedes", status: "APROVADO", dias: 12, itens: [["COL-1011", 1], ["BIO-2002", 1]] },
    { hosp: "SCEC", conv: null, pac: "Rogério Pimentel Dantas", status: "RECUSADO", dias: 20, itens: [["END-4001", 1], ["END-4004", 1], ["END-4005", 1]] },
    { hosp: "GUAR", conv: "Total Care Planos de Saúde", pac: "Aparecida Ferraz Nogueira", status: "RASCUNHO", dias: 0, itens: [["DOR-3003", 2], ["DOR-3001", 1]] },
  ];
  for (const d of defs) {
    const h = c.hosp.get(d.hosp)!;
    const tabela = await c.tx.hospital.findUniqueOrThrow({ where: { id: h.id }, select: { tabelaPreco: { include: { itens: true } } } });
    const preco = new Map(tabela.tabelaPreco?.itens.map((i) => [i.produtoId, Number(i.preco.toString())]) ?? []);
    const itens = [];
    for (const [cod, q] of d.itens) {
      const info = await infoProduto(c, cod);
      itens.push({ produtoId: info.id, quantidade: q, precoUnit: r2(preco.get(info.id) ?? info.preco) });
    }
    const criado = addD(c.hoje, -d.dias);
    await c.tx.orcamento.create({
      data: { hospitalId: h.id, convenioId: d.conv ? c.conv.get(d.conv) : null, paciente: d.pac, status: d.status, validade: addD(criado, 15), criadoEm: hora(criado, 10), itens: { create: itens } },
    });
    conta(c, "Orçamento", 1);
  }
}

/**
 * Venda direta a subdistribuidor (pedido de venda SEM cirurgia). O sistema ainda não tem serviço para isso (só faturarCirurgia cria
 * pedido), então a carga monta o pedido e baixa o depósito com movimentar() (CONSUMO, documento PV-n), e usa o registrarNfTx real.
 */
export async function executarVendaDireta(c: Ctx, v: PlanoVenda) {
  const { tx } = c;
  const h = c.hosp.get(v.sub)!;
  const linhas: Linha[] = [];
  for (const it of v.itens) {
    await garantirDisponivel(c, it.cod, it.qtd, v.dia);
    linhas.push(...(await pegarLotes(c, it.cod, it.qtd)));
  }
  const precos = await precosDoHospital(tx, h.id, linhas.map((l) => l.produtoId), hora(v.dia, 10));
  const lotes = new Map((await tx.lote.findMany({ where: { id: { in: linhas.map((l) => l.loteId) } }, select: { id: true, numero: true } })).map((l) => [l.id, l.numero]));
  let total = 0;
  let custoTotal = 0;
  const itens = linhas.map((l) => {
    const p = precos.get(l.produtoId)!;
    total += r2(p.preco * l.quantidade);
    custoTotal += r2(p.custo * l.quantidade);
    return { produtoId: l.produtoId, loteNumero: lotes.get(l.loteId) ?? null, quantidade: l.quantidade, precoUnit: p.preco, custoUnit: p.custo };
  });
  total = r2(total);
  const pedido = await tx.pedidoVenda.create({
    data: {
      hospitalId: h.id, representanteId: c.rep.get(h.def.rep) ?? null, status: "ABERTO", total, custoTotal: r2(custoTotal), comissao: r2(total * 0.02),
      criadoEm: hora(v.dia, 9), centroCustoId: c.centro.get("SUB")!, itens: { create: itens },
    },
  });
  for (const l of linhas) {
    const p = precos.get(l.produtoId)!;
    await movimentar(tx, {
      tipo: "CONSUMO", produtoId: l.produtoId, loteId: l.loteId, quantidade: l.quantidade, origemId: LOCAIS.DEPOSITO, destinoId: null, custoUnit: p.custo,
      documento: `PV-${pedido.id}`, observacao: "Venda direta a subdistribuidor", usuario: c.u.comercial.nome,
    });
  }
  await redatarMovs(c, hora(v.dia, 10));
  const venc = addD(v.dia, h.def.prazo);
  const cr = await registrarNfTx(tx, pedido.id, String(c.notaFiscal++), venc, hora(v.dia, 11));
  await tx.contaReceber.update({ where: { id: cr.id }, data: { criadoEm: hora(v.dia, 11, 5) } });
  c.receber.push({ id: cr.id, valor: Number(cr.valor.toString()), vencimento: venc, nfDia: v.dia, hospKey: v.sub, convenio: false, glosa: false });
  conta(c, "Venda direta a subdistribuidor (pedido sem cirurgia, com NF)", 1);
}
