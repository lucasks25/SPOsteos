/** Financeiro da demonstração: contas, despesas recorrentes, baixas, glosas, extrato e OFX. Usa os serviços reais de títulos. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { registrarBaixa, registrarGlosa, registrarRecurso, transferir } from "@/app/(app)/financeiro/_lib/titulos";
import { salvarContaPagarTx } from "@/app/(app)/financeiro/_lib/titulos-servico";
import { conta, type Ctx } from "./ctx";
import { addD, dia, diaUtil, entre, fimMes, hora, iniMes, pick, r2, somaMes, ymd } from "./util";

const FORMAS_REC = [["PIX", 4], ["TED", 4], ["BOLETO", 2]] as const;
const formaRec = (c: Ctx) => {
  const x = c.rnd() * 10;
  return x < FORMAS_REC[0][1] ? "PIX" : x < FORMAS_REC[0][1] + FORMAS_REC[1][1] ? "TED" : "BOLETO";
};

export async function prepararContas(c: Ctx) {
  const { tx } = c;
  let itau = await tx.contaBancaria.findFirst({ where: { tipo: "BANCO", ativo: true }, orderBy: { criadoEm: "asc" } });
  if (!itau) {
    itau = await tx.contaBancaria.create({
      data: { nome: "Itaú c/c 72192-0 (operacional)", tipo: "BANCO", banco: "341", agencia: "0057", numero: "72192-0", titularCnpj: "19.966.249/0001-84", titularNome: "SP OSTEOS DISTRIBUIDORA DE PRODUTOS PARA A SAUDE LTDA", saldoInicial: 0 },
    });
  }
  await tx.contaBancaria.update({ where: { id: itau.id }, data: { carteiraCobranca: itau.carteiraCobranca ?? "109" } });
  let caixa = await tx.contaBancaria.findFirst({ where: { tipo: "CAIXA", ativo: true }, orderBy: { criadoEm: "asc" } });
  if (!caixa) caixa = await tx.contaBancaria.create({ data: { nome: "Caixa", tipo: "CAIXA", saldoInicial: 0 } });
  await tx.contaBancaria.update({ where: { id: caixa.id }, data: { saldoInicial: 300 } });
  c.contaId = itau.id;
  c.caixaId = caixa.id;
}

type Despesa = { desc: string; plano: string; valor: number; venc: Date; comp: Date; forn?: string; pagar?: boolean; forma?: "PIX" | "TED" | "BOLETO"; centro?: string };

async function lancarDespesa(c: Ctx, d: Despesa) {
  const criado = new Date(Math.min(addD(d.venc, -12).getTime(), addD(c.hoje, -1).getTime()));
  const id = await salvarContaPagarTx(c.tx, null, {
    descricao: d.desc, fornecedorId: d.forn ? c.forn.get(d.forn)! : null, planoContaId: c.plano.get(d.plano)!, centroCustoId: d.centro ? c.centro.get(d.centro)! : null, competencia: d.comp,
    codigoBarras: null, valor: d.valor, vencimento: d.venc,
  }, c.u.financeiro.id);
  await c.tx.contaPagar.update({ where: { id }, data: { criadoEm: hora(criado, 10) } });
  const futuro = d.venc.getTime() > addD(c.hoje, 10).getTime();
  c.pagar.push({ id, valor: d.valor, vencimento: d.venc, criado, aprovar: !futuro, pagar: d.pagar ?? true, forma: d.forma ?? "BOLETO" });
  conta(c, "Conta a pagar (despesa)", 1);
}

/** Despesas recorrentes de mai/2026 até as próximas parcelas, proporcionais ao faturamento de cada mês. */
export async function despesas(c: Ctx) {
  const { tx } = c;
  const mesesHist = [0, 1, 2, 3, 4, 5].map((i) => somaMes(dia("2026-05-01"), i));
  for (const [i, m] of mesesHist.entries()) {
    const ini = iniMes(m);
    const prox = somaMes(m, 1);
    const ultimoMes = i === 5;
    const comp = ultimoMes ? addD(c.hoje, -1) : fimMes(m);
    const pvs = await tx.pedidoVenda.findMany({ where: { status: "FATURADO", faturadoEm: { gte: hora(ini, 0), lt: hora(prox, 0) } }, select: { total: true, comissao: true } });
    const receita = pvs.reduce((s, p) => s + Number(p.total.toString()), 0);
    const comissao = pvs.reduce((s, p) => s + Number(p.comissao.toString()), 0);
    const mm = ymd(ini).slice(0, 7);
    const rot = `${String(m.getUTCMonth() + 1).padStart(2, "0")}/${m.getUTCFullYear()}`;
    const dm = (mes: Date, d: number) => diaUtil(new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), d)));
    const cresc = i >= 2 ? 1_500 : 0;
    await lancarDespesa(c, { desc: `Folha de pagamento ${rot}`, plano: "4.01", valor: 36_000 + cresc * (i - 1 > 0 ? i - 1 : 0), comp, venc: dm(prox, 5), forma: "TED" });
    await lancarDespesa(c, { desc: `Encargos sociais (FGTS e INSS) ${rot}`, plano: "4.01", valor: 11_500 + (i > 1 ? 450 * (i - 1) : 0), comp, venc: dm(prox, 20) });
    await lancarDespesa(c, { desc: `Aluguel do escritório e depósito ${rot}`, plano: "4.02", valor: 10_000, comp: dm(ini, 5), venc: dm(ini, 10) });
    await lancarDespesa(c, { desc: `Energia, água e internet ${rot}`, plano: "4.02", valor: entre(c.rnd, 2600, 3400) + 0.37, comp, venc: dm(ini, 15) });
    await lancarDespesa(c, { desc: `Fretes e entregas a hospitais ${rot}`, plano: "4.03", valor: r2(3_800 + receita * 0.012), comp, venc: dm(ini, 25), forn: "MEDL", pagar: mm !== "2026-09", forma: "PIX" });
    await lancarDespesa(c, { desc: `Contabilidade ${rot}`, plano: "4.04", valor: 4_000, comp, venc: dm(prox, 10), forma: "PIX" });
    await lancarDespesa(c, { desc: `Assessoria regulatória (ANVISA) ${rot}`, plano: "4.04", valor: 4_500, comp, venc: dm(prox, 10), forma: "PIX" });
    await lancarDespesa(c, { desc: `Congressos e educação continuada ${rot}`, plano: "4.07", valor: entre(c.rnd, 4000, 12000) + 0.0, comp, venc: dm(ini, 18), pagar: mm !== "2026-09", forma: "PIX", centro: "EVT" });
    await lancarDespesa(c, { desc: `Material de escritório e despesas administrativas ${rot}`, plano: "4.06", valor: entre(c.rnd, 1300, 2800) + 0.45, comp, venc: dm(ini, 12) });
    await lancarDespesa(c, { desc: `Licenças de software e sistema de gestão ${rot}`, plano: "4.08", valor: 2_800, comp, venc: dm(ini, 8), forma: "BOLETO" });
    if (comissao > 0) await lancarDespesa(c, { desc: `Comissões de representantes ${rot}`, plano: "4.05", valor: r2(comissao), comp, venc: dm(prox, 10), forma: "PIX" });
    if (i >= 1) {
      await lancarDespesa(c, { desc: `Parcela do capital de giro (principal) ${rot}`, plano: "8.02", valor: 22_000, comp: dm(ini, 15), venc: dm(ini, 15), forma: "BOLETO" });
      await lancarDespesa(c, { desc: `Juros do capital de giro ${rot}`, plano: "6.01", valor: 5_200 - i * 300, comp: dm(ini, 15), venc: dm(ini, 15), forma: "BOLETO" });
    }
    if (receita > 0) await lancarDespesa(c, { desc: `Impostos sobre vendas ${rot}`, plano: "2.01", valor: r2(receita * 0.072), comp, venc: dm(prox, 20) });
  }
  // parcelas e compromissos futuros (espalham o fluxo de caixa pelas próximas semanas)
  const futuros: Despesa[] = [
    { desc: "Parcela do capital de giro (principal) 11/2026", plano: "8.02", valor: 22_000, comp: dia("2026-11-16"), venc: dia("2026-11-16") },
    { desc: "Juros do capital de giro 11/2026", plano: "6.01", valor: 3_700, comp: dia("2026-11-16"), venc: dia("2026-11-16") },
    { desc: "Parcela do capital de giro (principal) 12/2026", plano: "8.02", valor: 22_000, comp: dia("2026-12-15"), venc: dia("2026-12-15") },
    { desc: "Juros do capital de giro 12/2026", plano: "6.01", valor: 3_400, comp: dia("2026-12-15"), venc: dia("2026-12-15") },
    { desc: "Aluguel do escritório e depósito 11/2026", plano: "4.02", valor: 11_000, comp: dia("2026-11-05"), venc: dia("2026-11-10") },
    { desc: "Aluguel do escritório e depósito 12/2026", plano: "4.02", valor: 11_000, comp: dia("2026-12-05"), venc: dia("2026-12-10") },
    { desc: "Aluguel do escritório e depósito 01/2027", plano: "4.02", valor: 11_550, comp: dia("2027-01-05"), venc: dia("2027-01-11") },
    { desc: "Seguro empresarial e de transporte (parcela 2/6)", plano: "4.06", valor: 2_900, comp: dia("2026-11-05"), venc: dia("2026-11-05") },
    { desc: "Seguro empresarial e de transporte (parcela 3/6)", plano: "4.06", valor: 2_900, comp: dia("2026-12-05"), venc: dia("2026-12-07") },
    { desc: "Seguro empresarial e de transporte (parcela 4/6)", plano: "4.06", valor: 2_900, comp: dia("2027-01-05"), venc: dia("2027-01-05") },
    { desc: "13º salário (1ª parcela)", plano: "4.01", valor: 28_000, comp: dia("2026-11-30"), venc: dia("2026-11-30"), forma: "TED" },
    { desc: "Taxa de fiscalização sanitária (vigilância)", plano: "4.06", valor: 9_800, comp: dia("2026-12-15"), venc: dia("2026-12-15") },
    { desc: "Sinal de 30% da importação em trânsito (Spinelink)", plano: "8.01", valor: 36_000, comp: dia("2026-10-15"), venc: dia("2026-11-06"), forn: "IMPL", forma: "TED" },
    { desc: "Folha de pagamento 11/2026", plano: "4.01", valor: 42_000, comp: dia("2026-11-30"), venc: dia("2026-12-07"), forma: "TED" },
    { desc: "IPTU do depósito (parcela 8/10)", plano: "4.02", valor: 2_900, comp: dia("2026-11-20"), venc: dia("2026-11-20") },
    { desc: "IPTU do depósito (parcela 9/10)", plano: "4.02", valor: 2_900, comp: dia("2026-12-20"), venc: dia("2026-12-21") },
    { desc: "Anuidade da associação do setor (ABRAIDI)", plano: "4.06", valor: 4_800, comp: dia("2026-12-01"), venc: dia("2026-12-01") },
    { desc: "Locação de veículos para entregas 11/2026", plano: "4.03", valor: 6_200, comp: dia("2026-11-25"), venc: dia("2026-11-25"), forn: "MEDL", forma: "PIX" },
    { desc: "Locação de veículos para entregas 12/2026", plano: "4.03", valor: 6_200, comp: dia("2026-12-22"), venc: dia("2026-12-22"), forn: "MEDL", forma: "PIX" },
  ];
  for (const d of futuros) await lancarDespesa(c, d);
}

async function lancar(c: Ctx, contaId: string, data: Date, sentido: "ENTRADA" | "SAIDA", valor: number, descricao: string, plano: string | null, categoria: string) {
  const l = await c.tx.lancamento.create({
    data: { contaId, data, sentido, valor, descricao, categoria, planoContaId: plano ? c.plano.get(plano)! : null, criadoEm: hora(data, 17) },
  });
  if (contaId === c.contaId) c.lancItau.push({ id: l.id, data, sentido, valor, descricao });
  return l;
}

/** Tarifas, rendimentos, transferência para o caixa e pequenas despesas em dinheiro. */
export async function avulsos(c: Ctx) {
  await lancar(c, c.contaId, dia("2026-05-06"), "ENTRADA", 500_000, "Liberação de empréstimo para capital de giro", "8.02", "Empréstimo");
  for (let i = 0; i < 5; i++) {
    const m = somaMes(dia("2026-05-01"), i);
    await lancar(c, c.contaId, diaUtil(new Date(Date.UTC(2026, m.getUTCMonth(), 28))), "SAIDA", r2(96.7 + i * 3.2), "Tarifa de manutenção e pacote de serviços", "6.03", "Tarifa");
    await lancar(c, c.contaId, diaUtil(new Date(Date.UTC(2026, m.getUTCMonth(), 29))), "ENTRADA", r2(380 + c.rnd() * 260), "Rendimento de aplicação automática", "5.03", "Rendimento");
  }
  await lancar(c, c.contaId, dia("2026-10-14"), "SAIDA", 134.9, "Tarifa de TED e pagamento em lote (SISPAG)", "6.03", "Tarifa");
  // transferência Itaú → Caixa e gastos pequenos em dinheiro
  const t = await transferir(c.tx, { origemId: c.contaId, destinoId: c.caixaId, valor: 2_000, data: dia("2026-09-01"), descricao: "Reforço do caixa" });
  const pernas = await c.tx.lancamento.findMany({ where: { transferenciaId: t.id } });
  for (const p of pernas) {
    await c.tx.lancamento.update({ where: { id: p.id }, data: { criadoEm: hora(dia("2026-09-01"), 9) } });
    if (p.contaId === c.contaId) c.lancItau.push({ id: p.id, data: p.data, sentido: "SAIDA", valor: 2_000, descricao: p.descricao });
  }
  const gastos: [string, number, string, string, string][] = [
    ["2026-09-04", 86.5, "Motoboy: entrega de instrumental ao Hospital Vila Aurora", "4.03", "Logística"],
    ["2026-09-18", 212.9, "Café, água e material de limpeza do depósito", "4.06", "Administrativas"],
    ["2026-10-02", 148, "Táxi: representante ao Hospital Santa Cecília", "4.03", "Logística"],
    ["2026-10-09", 64.3, "Cópias e autenticações de documentos", "4.06", "Administrativas"],
  ];
  for (const [d, v, desc, pl, cat] of gastos) await lancar(c, c.caixaId, dia(d), "SAIDA", v, desc, pl, cat);
  conta(c, "Lançamento avulso", 12 + gastos.length);
}

const CATEGORIAS = ["SEM_AUTORIZACAO", "DIVERGENCIA_MATERIAL_GUIA", "TECNICA", "ADMINISTRATIVA"] as const;
const MOTIVOS: Record<(typeof CATEGORIAS)[number], string> = {
  SEM_AUTORIZACAO: "Quantidade de material acima da autorizada na guia do convênio.",
  DIVERGENCIA_MATERIAL_GUIA: "Material faturado diverge do descrito na guia autorizada.",
  TECNICA: "Glosa técnica: auditoria questionou a indicação do implante.",
  ADMINISTRATIVA: "Glosa administrativa: documentação da cirurgia incompleta.",
};

/** Simula os recebimentos dos hospitais (maioria paga, parte vencida, parte a vencer) e as glosas. */
export async function recebimentos(c: Ctx) {
  const { tx } = c;
  const ultimo = addD(c.hoje, -1);
  let nGlosa = 0;
  // inadimplência garantida (aging com faixas de 1-30, 31-60 e +60 dias): os dois últimos títulos já vencidos da Santa Casa, do Hospital Santa Luzia
  // e do subdistribuidor de Salvador ficam sem pagamento, e um título mais antigo da Santa Casa também.
  const vencidos = c.receber.filter((t) => t.vencimento.getTime() < addD(c.hoje, -3).getTime()).sort((x, y) => y.vencimento.getTime() - x.vencimento.getTime());
  const calote = new Set<string>();
  for (const h of ["SCAS", "OSAS", "SSAL"]) for (const t of vencidos.filter((x) => x.hospKey === h).slice(0, 2)) calote.add(t.id);
  const antigo = vencidos.filter((x) => x.hospKey === "SCAS" && x.vencimento.getTime() < dia("2026-08-20").getTime()).slice(0, 1);
  for (const t of antigo) calote.add(t.id);
  for (const t of [...c.receber].sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())) {
    const perfil = c.hosp.get(t.hospKey)!.def.pag;
    const atraso = entre(c.rnd, perfil.a, perfil.b);
    const nunca = calote.has(t.id) || c.rnd() < perfil.nunca;
    let saldo = t.valor;
    let data = diaUtil(addD(t.vencimento, atraso));
    if (t.glosa && nGlosa < CATEGORIAS.length) {
      const cat = CATEGORIAS[nGlosa];
      const gdata = diaUtil(addD(t.nfDia, 18));
      const valorG = r2(t.valor * (0.04 + c.rnd() * 0.07));
      const g = await registrarGlosa(tx, { tituloId: t.id, valor: valorG, data: gdata, motivo: MOTIVOS[cat], categoria: cat });
      await tx.glosa.update({ where: { id: g.id }, data: { criadoEm: hora(gdata, 15) } });
      if (nGlosa === 0 || nGlosa === 3) await registrarRecurso(tx, g.id, "RECORRER", addD(gdata, 6));
      if (nGlosa === 1) {
        await registrarRecurso(tx, g.id, "RECORRER", addD(gdata, 6));
        await registrarRecurso(tx, g.id, "MANTER", addD(gdata, 25));
      }
      saldo = r2(saldo - valorG);
      data = diaUtil(addD(gdata, Math.max(atraso, 5)));
      nGlosa++;
      conta(c, "Glosa", 1);
    }
    if (nunca || data.getTime() > ultimo.getTime()) continue;

    const baixa = async (dt: Date, o: { valor: number; juros?: number; multa?: number; desconto?: number }) => {
      const l = await registrarBaixa(tx, { tipo: "receber", tituloId: t.id, contaId: c.contaId, data: dt, forma: formaRec(c), ...o });
      await tx.lancamento.update({ where: { id: l.id }, data: { criadoEm: hora(dt, entre(c.rnd, 9, 16), entre(c.rnd, 0, 59)) } });
      c.lancItau.push({ id: l.id, data: dt, sentido: "ENTRADA", valor: Number(l.valor.toString()), descricao: l.descricao });
      conta(c, "Recebimento (baixa)", 1);
    };
    const r = c.rnd();
    const parcela2 = diaUtil(addD(data, 12));
    if (r < 0.08) {
      const p1 = r2(saldo * 0.6);
      await baixa(data, { valor: p1 });
      if (parcela2.getTime() <= ultimo.getTime()) await baixa(parcela2, { valor: r2(saldo - p1) });
    } else if (r < 0.14) {
      const desc = r2(saldo * 0.015);
      await baixa(data, { valor: r2(saldo - desc), desconto: desc });
    } else if (atraso > 10 && r < 0.45) {
      const multa = r2(saldo * 0.02);
      const juros = r2(saldo * 0.01 * (atraso / 30));
      await baixa(data, { valor: r2(saldo + multa + juros), multa, juros });
    } else await baixa(data, { valor: saldo });
  }
}

/** Aprova e paga as contas a pagar (quem criou não aprova: aprovam o admin e o financeiro). */
export async function pagamentos(c: Ctx) {
  const { tx } = c;
  const ultimo = addD(c.hoje, -1);
  for (const t of [...c.pagar].sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())) {
    if (t.aprovar) {
      const quando = new Date(Math.min(hora(addD(t.vencimento, -6), 15).getTime(), hora(ultimo, 16).getTime()));
      await tx.contaPagar.update({ where: { id: t.id }, data: { aprovadoEm: quando, aprovadoPor: c.u.admin.id } });
    }
    const data = diaUtil(addD(t.vencimento, entre(c.rnd, -1, 2)));
    if (!t.pagar || !t.aprovar || data.getTime() > ultimo.getTime()) continue;
    const multa = c.rnd() < 0.05 ? r2(t.valor * 0.02) : 0;
    const l = await registrarBaixa(tx, { tipo: "pagar", tituloId: t.id, contaId: c.contaId, data, valor: r2(t.valor + multa), multa, forma: t.forma });
    await tx.lancamento.update({ where: { id: l.id }, data: { criadoEm: hora(data, entre(c.rnd, 9, 16), entre(c.rnd, 0, 59)) } });
    c.lancItau.push({ id: l.id, data, sentido: "SAIDA", valor: Number(l.valor.toString()), descricao: l.descricao });
    conta(c, "Pagamento (baixa)", 1);
  }
}

/** Dois itens ainda sem conta do plano (fila de /financeiro/classificar). */
export async function pendentesDeClassificacao(c: Ctx) {
  const { tx } = c;
  await tx.contaPagar.create({
    data: {
      descricao: "Taxa condominial do depósito 10/2026", valor: 1_240.5, vencimento: dia("2026-10-28"), competencia: dia("2026-10-15"),
      criadoPor: c.u.financeiro.id, criadoEm: hora(addD(c.hoje, -3), 11),
    },
  });
  const l = await tx.lancamento.create({
    data: { contaId: c.contaId, data: dia("2026-10-09"), sentido: "SAIDA", valor: 28.5, descricao: "Tarifa de DOC/TED avulsa", criadoEm: hora(dia("2026-10-09"), 17) },
  });
  c.lancItau.push({ id: l.id, data: l.data, sentido: "SAIDA", valor: 28.5, descricao: l.descricao });
}

/** Dados bancários aprovados (dupla checagem) para os fornecedores: habilita remessa SISPAG. */
export async function favorecidos(c: Ctx) {
  const { hashDadosPagamento } = await import("@/app/(app)/financeiro/_lib/favorecidos-aprovacao");
  const dados: [string, { bancoCodigo: string | null; agencia: string | null; conta: string | null; contaDigito: string | null; chavePix: string | null }][] = [
    ["DESC", { bancoCodigo: "341", agencia: "3821", conta: "45120", contaDigito: "7", chavePix: null }],
    ["BIOL", { bancoCodigo: "237", agencia: "1450", conta: "0093816", contaDigito: "2", chavePix: null }],
    ["ENDO", { bancoCodigo: null, agencia: null, conta: null, contaDigito: null, chavePix: "financeiro@endotec.com.br" }],
    ["MEDL", { bancoCodigo: "341", agencia: "0912", conta: "28764", contaDigito: "1", chavePix: null }],
    ["IMPL", { bancoCodigo: "001", agencia: "3305", conta: "114790", contaDigito: "X", chavePix: null }],
  ];
  for (const [k, d] of dados) {
    const f = await c.tx.fornecedor.findUniqueOrThrow({ where: { id: c.forn.get(k)! } });
    const hash = hashDadosPagamento({ cnpj: f.cnpj, ...d });
    await c.tx.fornecedor.update({
      where: { id: f.id },
      data: { ...d, pagamentoAlteradoEm: hora(addD(c.hoje, -40), 10), pagamentoAlteradoPor: c.u.financeiro.id, pagamentoAprovadoHash: hash, pagamentoAprovadoEm: hora(addD(c.hoje, -39), 10), pagamentoAprovadoPor: c.u.admin.id },
    });
  }
}

/** Extrato bancário importado até 09/10 (conciliado) e 2 linhas ainda sem lançamento. */
export async function extrato(c: Ctx) {
  const corte = dia("2026-10-09");
  const lancs = c.lancItau.filter((l) => l.data.getTime() <= corte.getTime() && l.data.getTime() >= dia("2026-08-01").getTime());
  const seq = new Map<string, number>();
  for (const l of lancs.sort((a, b) => a.data.getTime() - b.data.getTime())) {
    const k = ymd(l.data).replaceAll("-", "");
    const n = (seq.get(k) ?? 0) + 1;
    seq.set(k, n);
    await c.tx.extratoLinha.create({
      data: {
        contaId: c.contaId, data: l.data, valor: l.sentido === "ENTRADA" ? l.valor : -l.valor, descricao: l.descricao.toUpperCase().slice(0, 60), fitid: `ITAU${k}${String(n).padStart(3, "0")}`, origem: "OFX",
        lancamentoId: l.id, conciliadoEm: hora(addD(l.data, 1), 9), importadoEm: hora(addD(l.data, 1), 8),
      },
    });
  }
  conta(c, "Linha de extrato conciliada", lancs.length);
  const soltas: [string, number, string][] = [
    ["2026-10-13", -35, "TARIFA BANCARIA CESTA PJ"],
    ["2026-10-14", 356.18, "REND PAGO APLIC AUT MAIS"],
  ];
  for (const [d, v, desc] of soltas) {
    await c.tx.extratoLinha.create({ data: { contaId: c.contaId, data: dia(d), valor: v, descricao: desc, fitid: `ITAU${d.replaceAll("-", "")}X01`, origem: "OFX", importadoEm: hora(dia("2026-10-15"), 8) } });
  }
  conta(c, "Linha de extrato pendente", soltas.length);
}

/** Ajusta o saldo inicial da conta para o saldo nunca ficar negativo e devolve o saldo final. */
export async function ajustarSaldoInicial(c: Ctx) {
  const ls = await c.tx.lancamento.findMany({ where: { contaId: c.contaId }, orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { data: true, sentido: true, valor: true } });
  let acc = 0;
  let min = 0;
  // por dia: entradas antes das saídas (como o banco compensa)
  const porDia = new Map<string, number>();
  for (const l of ls) porDia.set(ymd(l.data), (porDia.get(ymd(l.data)) ?? 0) + (l.sentido === "ENTRADA" ? 1 : -1) * Number(l.valor.toString()));
  for (const k of [...porDia.keys()].sort()) {
    acc += porDia.get(k)!;
    min = Math.min(min, acc);
  }
  const inicial = Math.ceil((Math.max(0, -min) + 90_000) / 5_000) * 5_000;
  await c.tx.contaBancaria.update({ where: { id: c.contaId }, data: { saldoInicial: inicial } });
  return { inicial, final: r2(inicial + acc) };
}

/** OFX de demonstração para importar ao vivo (não é importado aqui). */
export async function gerarOfx(c: Ctx) {
  const { tx } = c;
  const pv2 = await tx.contaReceber.findFirst({ where: { descricao: { startsWith: "PV-2 " }, status: "ABERTO" } });
  const abertos = await tx.contaReceber.findMany({ where: { status: "ABERTO", valorBaixado: null, vencimento: { gte: c.hoje, lte: addD(c.hoje, 25) } }, orderBy: { vencimento: "asc" }, include: { hospital: true } });
  const saldos = new Map<string, number>();
  for (const t of await tx.contaReceber.findMany({ where: { status: "ABERTO" }, select: { valor: true, valorBaixado: true } })) {
    const s = r2(Number(t.valor.toString()) - Number(t.valorBaixado?.toString() ?? 0));
    saldos.set(s.toFixed(2), (saldos.get(s.toFixed(2)) ?? 0) + 1);
  }
  const outro = abertos.find((t) => saldos.get(Number(t.valor.toString()).toFixed(2)) === 1 && t.id !== pv2?.id);
  if (!pv2 || !outro) {
    console.warn("OFX de demonstração não gerado: não achei o título do PV-2 ou outro título a receber em aberto.");
    return null;
  }
  const v1 = r2(Number(pv2.valor.toString()) - Number(pv2.valorBaixado?.toString() ?? 0));
  const v2 = Number(outro.valor.toString());
  const hoje = ymd(c.hoje).replaceAll("-", "");
  const nomeH = (outro.hospital?.nomeFantasia ?? "HOSPITAL").toUpperCase();
  const trn = (tipo: string, fitid: string, valor: number, memo: string) =>
    `<STMTTRN>\n<TRNTYPE>${tipo}\n<DTPOSTED>${hoje}120000[-3:BRT]\n<TRNAMT>${valor.toFixed(2)}\n<FITID>${fitid}\n<MEMO>${memo}\n</STMTTRN>`;
  const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${hoje}090000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0341
<BRANCHID>0057
<ACCTID>72192-0
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${hoje}000000[-3:BRT]
<DTEND>${hoje}235959[-3:BRT]
${trn("CREDIT", `DEMO${hoje}001`, v1, "TED RECEBIDA HOSP SAO LUCAS")}
${trn("CREDIT", `DEMO${hoje}002`, v2, `PIX RECEBIDO ${nomeH}`)}
${trn("DEBIT", `DEMO${hoje}003`, -89.9, "TARIFA PACOTE SERVICOS PJ")}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
  const caminho = join(process.cwd(), "scripts", "demo", "extrato-demo.ofx");
  writeFileSync(caminho, ofx, "latin1");
  return { caminho, v1, v2, titulo2: outro.descricao };
}
void pick;
