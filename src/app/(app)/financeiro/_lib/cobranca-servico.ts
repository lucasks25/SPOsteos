import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { gerarRemessaCobranca, type EventoCobranca, type ItemRemessaCobranca, type RetornoCobranca } from "./cobranca";
import { diaBrasilia } from "@/lib/datas";
import { contaEDac } from "./sispag-regras";
import { registrarBaixa, saldoTitulo } from "./titulos";

/**
 * Regras de cobrança dos hospitais que mexem no banco (remessa CNAB 400 Itaú, carteira 109).
 * Fora de "use server" para serem testadas sem login. O módulo puro de layout é cobranca.ts.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const cent = (n: number) => Math.round(n * 100);
const pad8 = (n: number) => String(n).padStart(8, "0");

export type ContagemCobranca = { registrados: number; rejeitados: number; liquidados: number; baixados: number; duplicados: number; divergentes: number; ignorados: number; jaProcessados: number };
export const contagemCobrancaVazia = (): ContagemCobranca => ({ registrados: 0, rejeitados: 0, liquidados: 0, baixados: 0, duplicados: 0, divergentes: 0, ignorados: 0, jaProcessados: 0 });

/** Dados do hospital que o boleto exige; devolve o que falta. */
export function faltaNoPagador(h: { razaoSocial: string; cnpj: string; endereco: string | null; bairro: string | null; cep: string | null; cidade: string | null; uf: string | null }): string[] {
  const falta: string[] = [];
  if (!h.endereco) falta.push("endereço");
  if (!h.bairro) falta.push("bairro");
  if (!h.cep) falta.push("CEP");
  if (!h.cidade) falta.push("cidade");
  if (!h.uf) falta.push("UF");
  return falta;
}

/**
 * Gera a remessa de cobrança: entrada (ocorrência 01) dos títulos em `ids` e pedido de baixa (02) dos em `baixaIds`
 * (boleto registrado cujo título foi pago por outro meio ou cancelado). Trava a conta (sequência do nosso número) e os títulos.
 */
export async function gerarRemessaCobrancaTx(tx: Tx, a: { contaId: string; ids: string[]; baixaIds?: string[]; agora?: Date }) {
  const agora = a.agora ?? new Date();
  const hoje = diaBrasilia(agora);
  const baixaIds = a.baixaIds ?? [];
  if (a.ids.length + baixaIds.length === 0) throw new ErroNegocio("Selecione ao menos um título.");
  await tx.$queryRaw`SELECT id FROM "ContaBancaria" WHERE id = ${a.contaId} FOR UPDATE`;
  const conta = await tx.contaBancaria.findUnique({ where: { id: a.contaId } });
  if (!conta?.ativo || conta.tipo !== "BANCO") throw new ErroNegocio("Conta bancária inexistente ou inativa.");
  if (conta.carteiraCobranca !== "109") throw new ErroNegocio("Esta conta não está habilitada para cobrança. Informe a carteira 109 no cadastro da conta.");
  const cd = contaEDac(conta.numero);
  if (!conta.titularCnpj || !conta.titularNome || !conta.agencia || !cd) throw new ErroNegocio("Complete a conta bancária (agência, conta com dígito, CNPJ e razão social do titular) antes de gerar a cobrança.");
  const benef = { agencia: conta.agencia.replace(/\D/g, "").padStart(4, "0"), conta: cd.conta.replace(/^0+/, "").padStart(5, "0"), dac: cd.dac, nome: conta.titularNome, cnpj: conta.titularCnpj, carteira: "109" as const };

  const todos = [...a.ids, ...baixaIds];
  await tx.$queryRaw`SELECT id FROM "ContaReceber" WHERE id IN (${Prisma.join(todos)}) ORDER BY id FOR UPDATE`;
  const titulos = await tx.contaReceber.findMany({ where: { id: { in: todos } }, include: { hospital: true, pedido: { select: { id: true } } } });
  if (titulos.length !== new Set(todos).size) throw new ErroNegocio("Algum título selecionado não existe mais. Recarregue a página.");

  const erros: string[] = [];
  const itens: ItemRemessaCobranca[] = [];
  const registros: { contaReceberId: string; ocorrencia: "01" | "02"; nossoNumero: string; valor: number }[] = [];
  let proximo = conta.proximoNossoNumero;
  const entradas = titulos.filter((t) => a.ids.includes(t.id));
  const baixas = titulos.filter((t) => baixaIds.includes(t.id));

  for (const t of entradas) {
    const saldo = r2(toNumber(t.valor) - toNumber(t.valorBaixado));
    const falta = t.hospital ? faltaNoPagador(t.hospital) : ["hospital"];
    if (t.status !== "ABERTO") erros.push(`${t.descricao}: não está em aberto`);
    // boleto rejeitado, baixado pelo banco (decurso de prazo) ou liquidado e depois estornado: título em aberto pode ganhar boleto novo
    else if (t.cobrancaStatus && !["REJEITADO", "BAIXADO", "LIQUIDADO"].includes(t.cobrancaStatus)) erros.push(`${t.descricao}: já tem cobrança (${t.cobrancaStatus.toLowerCase()})`);
    else if (saldo <= 0) erros.push(`${t.descricao}: sem saldo`);
    else if (t.vencimento < hoje) erros.push(`${t.descricao}: vencimento já passou (altere o vencimento do título antes de cobrar)`);
    else if (!t.hospital || falta.length) erros.push(`${t.descricao}: falta no cadastro do hospital ${falta.join(", ")}`);
    else {
      if (proximo > 99999999) throw new ErroNegocio("A sequência do nosso número desta conta esgotou.");
      const nn = pad8(proximo++);
      const h = t.hospital;
      itens.push({
        ocorrencia: "01",
        nossoNumero: nn,
        seuNumero: t.pedido ? `PV${t.pedido.id}` : nn,
        emissao: hoje,
        vencimento: t.vencimento,
        valorCentavos: cent(saldo),
        jurosDiaCentavos: Math.round((cent(saldo) * (toNumber(conta.cobrancaJurosMensalPercent) / 100)) / 30),
        multa: toNumber(conta.cobrancaMultaPercent) > 0 ? { percentualCentesimos: Math.round(toNumber(conta.cobrancaMultaPercent) * 100) } : undefined,
        pagador: { nome: h.razaoSocial, documento: h.cnpj, logradouro: h.endereco!, bairro: h.bairro!, cep: h.cep!, cidade: h.cidade!, uf: h.uf! },
      });
      registros.push({ contaReceberId: t.id, ocorrencia: "01", nossoNumero: nn, valor: saldo });
    }
  }
  for (const t of baixas) {
    if (t.cobrancaContaId !== conta.id || !t.nossoNumero || t.cobrancaStatus !== "REGISTRADO") erros.push(`${t.descricao}: não tem boleto registrado nesta conta`);
    else if (t.status === "ABERTO") erros.push(`${t.descricao}: ainda está em aberto (pedir baixa só de título pago por outro meio ou cancelado)`);
    else {
      itens.push({ ocorrencia: "02", nossoNumero: t.nossoNumero, valorCentavos: cent(toNumber(t.valor)) });
      registros.push({ contaReceberId: t.id, ocorrencia: "02", nossoNumero: t.nossoNumero, valor: toNumber(t.valor) });
    }
  }
  if (erros.length) throw new ErroNegocio(`Corrija antes de gerar: ${erros.slice(0, 5).join("; ")}${erros.length > 5 ? ` (+${erros.length - 5})` : ""}.`);

  const conteudo = gerarRemessaCobranca(benef, itens, agora);
  const rem = await tx.remessaCobranca.create({ data: { contaId: conta.id, conteudo } });
  for (const r of registros) {
    await tx.remessaCobrancaItem.create({ data: { remessaId: rem.id, contaReceberId: r.contaReceberId, ocorrencia: r.ocorrencia, nossoNumero: r.nossoNumero, valor: r.valor } });
    if (r.ocorrencia === "01") await tx.contaReceber.update({ where: { id: r.contaReceberId }, data: { cobrancaContaId: conta.id, nossoNumero: r.nossoNumero, cobrancaStatus: "ENVIADO" } });
    else await tx.contaReceber.update({ where: { id: r.contaReceberId }, data: { cobrancaStatus: "BAIXA_ENVIADA" } });
  }
  await tx.contaBancaria.update({ where: { id: conta.id }, data: { proximoNossoNumero: proximo } });
  return { remessaId: rem.id, qtd: registros.length };
}

/** Cancela remessa de cobrança que não foi enviada ou foi recusada pelo banco: libera os títulos para nova remessa. */
export async function cancelarRemessaCobrancaTx(tx: Tx, remessaId: number, motivo: string) {
  await tx.$queryRaw`SELECT id FROM "RemessaCobranca" WHERE id = ${remessaId} FOR UPDATE`;
  const r = await tx.remessaCobranca.findUnique({ where: { id: remessaId }, include: { itens: true } });
  if (!r) throw new ErroNegocio("Remessa não encontrada.");
  if (r.canceladaEm) throw new ErroNegocio("Esta remessa já foi cancelada.");
  if (r.itens.some((i) => i.status !== "ENVIADO")) throw new ErroNegocio("O banco já respondeu a itens desta remessa: ela não pode mais ser cancelada. Se precisar, peça baixa do boleto.");
  for (const i of r.itens) {
    await tx.remessaCobrancaItem.update({ where: { id: i.id }, data: { status: "CANCELADO" } });
    await tx.contaReceber.update({ where: { id: i.contaReceberId }, data: i.ocorrencia === "01" ? { cobrancaStatus: null, nossoNumero: null, cobrancaContaId: null } : { cobrancaStatus: "REGISTRADO" } });
  }
  await tx.remessaCobranca.update({ where: { id: remessaId }, data: { canceladaEm: new Date(), canceladaMotivo: motivo } });
}

/** Aplica o retorno de cobrança: confirma/rejeita registros, baixa liquidações e processa baixas. Idempotente por evento. */
export async function aplicarRetornoCobrancaTx(tx: Tx, ret: RetornoCobranca, cont: ContagemCobranca): Promise<Set<number>> {
  const ag = ret.agencia.replace(/^0+/, "");
  const cc = ret.conta.replace(/^0+/, "");
  const contas = await tx.contaBancaria.findMany({ where: { carteiraCobranca: "109", ativo: true } });
  const candidatas = contas.filter((c) => {
    const cd = contaEDac(c.numero);
    return cd && (c.agencia ?? "").replace(/\D/g, "").replace(/^0+/, "") === ag && cd.conta.replace(/^0+/, "") === cc && (!ret.dac || cd.dac === ret.dac);
  });
  // Duas contas ativas com a mesma agência/conta tornariam a baixa ambígua (o nosso número é por conta). O índice único
  // "ContaBancaria_banco_agencia_numero_ativa_key" impede o cadastro; esta checagem cobre bases antigas.
  if (candidatas.length > 1) throw new ErroNegocio(`Há ${candidatas.length} contas ativas com a agência ${ret.agencia} conta ${ret.conta}-${ret.dac} (${candidatas.map((c) => c.nome).join(", ")}). Inative a duplicada antes de importar o retorno.`);
  const conta = candidatas[0];
  if (!conta) throw new ErroNegocio(`O retorno é da agência ${ret.agencia} conta ${ret.conta}-${ret.dac}, que não é uma conta com cobrança habilitada neste sistema.`);

  const remessas = new Set<number>();
  for (const e of ret.eventos) {
    const dataEv = e.dataOcorrencia ?? diaBrasilia(new Date());
    const ja = await tx.cobrancaEvento.findUnique({ where: { contaId_nossoNumero_codigo_data: { contaId: conta.id, nossoNumero: e.nossoNumero, codigo: e.ocorrencia.codigo, data: dataEv } } });
    if (ja) {
      cont.jaProcessados++;
      continue;
    }
    await tx.$queryRaw`SELECT id FROM "ContaReceber" WHERE "cobrancaContaId" = ${conta.id} AND "nossoNumero" = ${e.nossoNumero} FOR UPDATE`;
    const titulo = await tx.contaReceber.findUnique({ where: { cobrancaContaId_nossoNumero: { cobrancaContaId: conta.id, nossoNumero: e.nossoNumero } } });
    if (!titulo) {
      cont.ignorados++;
      continue;
    }
    const item = await tx.remessaCobrancaItem.findFirst({ where: { contaReceberId: titulo.id, nossoNumero: e.nossoNumero }, orderBy: { id: "desc" } });
    if (item) remessas.add(item.remessaId);
    const marcar = async (status: string, itemStatus?: "CONFIRMADO" | "REJEITADO" | "LIQUIDADO" | "BAIXADO", extra?: string) => {
      await tx.contaReceber.update({ where: { id: titulo.id }, data: { cobrancaStatus: status } });
      if (item && itemStatus) await tx.remessaCobrancaItem.update({ where: { id: item.id }, data: { status: itemStatus, motivos: [item.motivos, extra].filter(Boolean).join(",") || null } });
    };

    switch (e.ocorrencia.categoria) {
      case "ENTRADA_CONFIRMADA":
        if (titulo.cobrancaStatus === "ENVIADO") {
          await marcar("REGISTRADO", "CONFIRMADO");
          cont.registrados++;
        }
        break;
      case "ENTRADA_REJEITADA":
        await marcar("REJEITADO", "REJEITADO", e.motivosRejeicao.map((m) => m.codigo).join("+") || undefined);
        cont.rejeitados++;
        break;
      case "LIQUIDACAO":
        await liquidar(tx, conta.id, titulo, e, item, cont, marcar);
        break;
      case "BAIXA":
        await marcar("BAIXADO", item?.ocorrencia === "02" ? "BAIXADO" : undefined);
        cont.baixados++;
        break;
      default:
        cont.ignorados++;
    }
    await tx.cobrancaEvento.create({ data: { contaId: conta.id, nossoNumero: e.nossoNumero, codigo: e.ocorrencia.codigo, data: dataEv } });
  }
  for (const id of remessas) await tx.remessaCobranca.update({ where: { id }, data: { retornoEm: new Date() } });
  return remessas;
}

async function liquidar(
  tx: Tx,
  contaId: string,
  titulo: { id: string; status: string; valor: Prisma.Decimal; valorBaixado: Prisma.Decimal | null },
  e: EventoCobranca,
  item: { id: number; valor: Prisma.Decimal; motivos: string | null } | null,
  cont: ContagemCobranca,
  marcar: (status: string, itemStatus?: "CONFIRMADO" | "REJEITADO" | "LIQUIDADO" | "BAIXADO", extra?: string) => Promise<void>,
) {
  const pago = e.centavos.pago / 100;
  if (titulo.status !== "ABERTO") {
    // o hospital pagou um boleto de título já quitado/cancelado aqui: o dinheiro entrou duas vezes (ou sem cobrança devida)
    await marcar("LIQUIDADO", "LIQUIDADO", "DUP");
    cont.duplicados++;
    return;
  }
  const saldo = saldoTitulo(toNumber(titulo.valor), toNumber(titulo.valorBaixado));
  if (pago <= 0) {
    await marcar("LIQUIDADO", "LIQUIDADO", "DIV");
    cont.divergentes++;
    return;
  }
  const dif = r2(pago - saldo);
  const intocado = item ? Math.abs(saldo - toNumber(item.valor)) < 0.005 : false;
  if (dif > 0.004 && !intocado) {
    // pagou acima do saldo e o título mudou depois da remessa: não dá para saber o que é juros; fica para a conciliação
    await marcar("LIQUIDADO", "LIQUIDADO", "DIV");
    cont.divergentes++;
    return;
  }
  const abatimento = r2((e.centavos.desconto + e.centavos.abatimento) / 100);
  const desconto = dif < -0.004 ? Math.min(abatimento, r2(-dif)) : 0;
  await registrarBaixa(tx, {
    tipo: "receber",
    tituloId: titulo.id,
    contaId,
    data: e.dataCredito ?? e.dataOcorrencia ?? diaBrasilia(new Date()),
    valor: pago,
    juros: dif > 0.004 ? dif : 0,
    desconto,
    forma: "BOLETO",
  });
  const aindaAberta = r2(saldo - pago - desconto) > 0.004; // pagou menos do que devia sem desconto que explique
  await marcar("LIQUIDADO", "LIQUIDADO", aindaAberta ? "DIV" : undefined);
  if (aindaAberta) cont.divergentes++;
  cont.liquidados++;
}
