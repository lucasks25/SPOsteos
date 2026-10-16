/** Situações pontuais da demonstração: pedidos abertos, vencido, mínimos, inventário, recolhimento, documentos. */
import { randomBytes } from "node:crypto";
import { criarInventario, salvarContagem } from "@/app/(app)/estoque/_lib/inventario-servico";
import { abrirRecolhimento, concluirRecolhimento, recolherFisico, registrarComunicado, registrarNota } from "@/app/(app)/qualidade/_lib/recolhimento-servico";
import { LOCAIS } from "@/lib/estoque";
import { conta, redatarMovs, type Ctx } from "./ctx";
import { infoProduto } from "./estoque";
import { addD, dia, hora, r2 } from "./util";

/** Dois pedidos de compra ainda abertos: um nacional (endoscopia) e uma importação em trânsito. */
export async function pedidosAbertos(c: Ctx) {
  const { tx } = c;
  const nac = await tx.pedidoCompra.create({
    data: { fornecedorId: c.forn.get("ENDO")!, previsao: dia("2026-10-30"), criadoEm: hora(dia("2026-10-15"), 9, 40), observacao: "Reposição de kits de endoscopia de coluna" },
  });
  for (const [cod, q] of [["END-4001", 10], ["END-4002", 8], ["END-4005", 30]] as const) {
    const p = await infoProduto(c, cod);
    await tx.pedidoCompraItem.create({ data: { pedidoId: nac.id, produtoId: p.id, quantidade: q, custoUnit: r2(p.custo * 1.04) } });
  }
  const cambio = 5.52;
  const imp = await tx.pedidoCompra.create({
    data: {
      fornecedorId: c.forn.get("IMPL")!, previsao: dia("2026-11-12"), criadoEm: hora(dia("2026-10-05"), 10), importacao: true, invoice: "SL-INV-26-0518", moeda: "USD", cambio, tipoCambio: "PTAX",
      incoterm: "FOB", dataInvoice: dia("2026-10-09"), observacao: "Embarque aéreo previsto: desembaraço em novembro",
    },
  });
  for (const [cod, q] of [["COL-1002", 40], ["COL-1004", 24], ["COL-1007", 10], ["COL-1010", 4]] as const) {
    const p = await infoProduto(c, cod);
    const precoMoeda = r2(p.custo / cambio / 1.14);
    await tx.pedidoCompraItem.create({ data: { pedidoId: imp.id, produtoId: p.id, quantidade: q, custoUnit: r2(precoMoeda * cambio), precoMoeda } });
  }
  conta(c, "Pedido de compra", 2);
}

/** Lote vencido (ortopedia) e estoque mínimo: uma haste abaixo do mínimo, os demais com folga. */
export async function ajustesDeEstoque(c: Ctx) {
  const { tx } = c;
  const venc = await tx.lote.findFirst({ where: { produto: { codigo: "BIO-2002" }, validade: addD(c.hoje, 1) } });
  if (venc) await tx.lote.update({ where: { id: venc.id }, data: { validade: dia("2026-10-05"), status: "VENCIDO" } });
  const abaixo = new Set(["COL-1003"]);
  const parados = new Set(["COL-1012", "COL-1013", "INS-7001", "INS-7002", "INS-7003", "BIO-2007", "END-4003"]);
  for (const [cod, p] of c.prod) {
    if (!/^(COL|BIO|DOR|END|VTP|DAP|INS)-/.test(cod)) continue;
    const agg = await tx.saldo.aggregate({
      where: { produtoId: p.id, quantidade: { gt: 0 }, local: { tipo: { in: ["DEPOSITO", "HOSPITAL"] } }, lote: { status: "LIBERADO", validade: { gte: c.hoje } } },
      _sum: { quantidade: true },
    });
    const disp = agg._sum.quantidade ?? 0;
    const minimo = abaixo.has(cod) ? disp + 3 : parados.has(cod) ? 0 : Math.min(disp, Math.max(2, Math.floor(disp * 0.3)));
    await tx.produto.update({ where: { id: p.id }, data: { estoqueMinimo: minimo } });
  }
}

/** Inventário de consignado em andamento (Hospital São Vicente de Guarulhos), com parte já contada. */
export async function inventario(c: Ctx) {
  const { tx } = c;
  const h = c.hosp.get("GUAR")!;
  const inv = await criarInventario(tx, { hospitalId: h.id, observacao: "Inventário trimestral do consignado", usuario: c.u.estoque.nome });
  await tx.inventarioConsignacao.update({ where: { id: inv.id }, data: { criadoEm: hora(addD(c.hoje, -2), 9) } });
  const itens = await tx.inventarioConsignacaoItem.findMany({ where: { inventarioId: inv.id }, orderBy: { id: "asc" } });
  const contagens = itens.slice(0, Math.ceil(itens.length * 0.6)).map((i, n) => ({ itemId: i.id, contado: n === 1 ? Math.max(0, i.saldoSistema - 1) : i.saldoSistema }));
  if (contagens.length) await salvarContagem(tx, inv.id, contagens);
  conta(c, "Inventário de consignado (em andamento)", 1);
}

/** Recolhimento antigo e concluído (lote de parafusos para deformidade; o lote não é usado no roteiro). */
export async function recolhimento(c: Ctx) {
  const { tx } = c;
  const lote = await tx.lote.findFirst({ where: { produto: { codigo: "COL-1012" } } });
  if (!lote) return;
  const { recolhimento: rec } = await abrirRecolhimento(tx, {
    loteIds: [lote.id], origem: "FABRICANTE", classe: "II", motivo: "Desvio no lacre da embalagem informado pelo fabricante (comunicado técnico)", referencia: "CT-2026/041",
    prazo: dia("2026-09-30"), observacao: "Lote sem uso em cirurgia até a data do comunicado.", usuario: c.u.qualidade.nome,
  });
  const dep = await tx.localEstoque.findUniqueOrThrow({ where: { id: LOCAIS.DEPOSITO } });
  await registrarComunicado(tx, rec.id, dep.id, c.u.qualidade.nome);
  await registrarNota(tx, rec.id, "Fabricante confirmou a troca sem custo; coleta agendada com a transportadora.", c.u.qualidade.nome);
  const alvo = await tx.recolhimentoAlvo.findFirstOrThrow({ where: { recolhimentoId: rec.id, localId: dep.id } });
  await recolherFisico(tx, rec.id, { alvoId: alvo.id, quantidade: alvo.saldoAbertura }, c.u.qualidade.nome);
  await redatarMovs(c, hora(dia("2026-09-22"), 11));
  await concluirRecolhimento(tx, rec.id, "Todas as unidades segregadas no estoque não conforme e devolvidas ao fabricante. Sem pacientes afetados.", c.u.qualidade.nome);
  await tx.recolhimento.update({ where: { id: rec.id }, data: { abertoEm: hora(dia("2026-09-14"), 9), concluidoEm: hora(dia("2026-09-29"), 16) } });
  await tx.recolhimentoAlvo.updateMany({ where: { recolhimentoId: rec.id }, data: { comunicadoEm: hora(dia("2026-09-15"), 10), recolhidoEm: hora(dia("2026-09-22"), 11) } });
  const acoes = await tx.recolhimentoAcao.findMany({ where: { recolhimentoId: rec.id }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] });
  for (const [i, a] of acoes.entries()) {
    const quando = i === acoes.length - 1 ? hora(dia("2026-09-29"), 16) : hora(addD(dia("2026-09-14"), i * 2), 9 + i);
    await tx.recolhimentoAcao.update({ where: { id: a.id }, data: { criadoEm: quando } });
  }
  conta(c, "Recolhimento (concluído)", 1);
}

/** Documentos regulatórios da empresa: AFE e licença sanitária vencendo em ~20 dias. */
export async function documentos(c: Ctx) {
  const { tx } = c;
  const base = { criadoPor: c.u.qualidade.id };
  const id = () => randomBytes(12).toString("hex");
  const docs = [
    { tipo: "AFE" as const, titulo: "AFE ANVISA da SP OSTEOS", numero: "8.04120-2", orgaoEmissor: "ANVISA", emissao: dia("2025-11-05"), validade: addD(c.hoje, 20), escopo: "EMPRESA" as const },
    { tipo: "LICENCA_SANITARIA" as const, titulo: "Licença sanitária do depósito", numero: "CEVS 355030-2026/0418", orgaoEmissor: "Vigilância Sanitária Municipal", emissao: dia("2025-11-04"), validade: addD(c.hoje, 19), escopo: "EMPRESA" as const },
    { tipo: "ALVARA" as const, titulo: "Alvará de funcionamento", numero: "2025-0098713", orgaoEmissor: "Prefeitura Municipal", emissao: dia("2026-03-31"), validade: dia("2027-03-31"), escopo: "EMPRESA" as const },
    { tipo: "AFE" as const, titulo: "AFE ANVISA da Medintra", numero: "8.04912-3", orgaoEmissor: "ANVISA", emissao: dia("2025-05-12"), validade: dia("2027-05-12"), escopo: "FORNECEDOR" as const, fornecedorId: c.forn.get("DESC")! },
    { tipo: "CERTIFICADO_BPF" as const, titulo: "Certificado de BPF da Biocore Distribuidora", numero: "BPF-2025/3391", orgaoEmissor: "ANVISA", emissao: dia("2025-08-20"), validade: dia("2027-08-20"), escopo: "FORNECEDOR" as const, fornecedorId: c.forn.get("BIOL")! },
  ];
  for (const d of docs) await tx.documento.create({ data: { id: id(), ...d, ...base } });
  const p = c.prod.get("VTP-5003")!;
  await tx.documento.create({
    data: { id: id(), tipo: "REGISTRO_ANVISA", titulo: "Registro ANVISA da agulha de biópsia óssea Sample Trap", numero: (await tx.produto.findUniqueOrThrow({ where: { id: p.id }, select: { registroAnvisa: true } })).registroAnvisa, orgaoEmissor: "ANVISA", emissao: addD(c.hoje, -3600 + 40), validade: addD(c.hoje, 40), escopo: "PRODUTO", produtoId: p.id, ...base },
  });
  conta(c, "Documento regulatório", docs.length + 1);
}
