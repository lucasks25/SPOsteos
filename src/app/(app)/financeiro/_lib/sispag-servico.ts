import "server-only";
import { Prisma, type FormaPagamento } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { divergenciaBoleto, lerBoleto } from "./boleto";
import { foiDevolvido, gerarRemessaSispag, situacaoRetorno, type Pagamento, type ResultadoPagamento } from "./sispag";
import { contaEDac, formaPrevista, type ModoRemessa } from "./sispag-regras";
import { registrarBaixa, saldoTitulo } from "./titulos";
import { situacaoAprovacao, travarFornecedores } from "./favorecidos-aprovacao";
import { pagamentoJaConciliado } from "./retorno-conciliado";

/** Regras de remessa e retorno do SISPAG que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */
const ATIVOS = ["ENVIADO", "AGENDADO"] as const;
const r2 = (n: number) => Math.round(n * 100) / 100;
const FORMA_BAIXA: Record<string, FormaPagamento> = { "45": "PIX", "30": "BOLETO", "31": "BOLETO", "01": "TED", "41": "TED" };

/** `jaConciliados`: pago no retorno, mas o título já tinha sido baixado pela conciliação com o mesmo pagamento (não é duplicidade). */
export type Contagem = { pagos: number; agendados: number; rejeitados: number; ignorados: number; jaBaixados: number; jaConciliados: number; divergentes: number; canceladasPagas: number; devolvidos: number };
export const contagemVazia = (): Contagem => ({ pagos: 0, agendados: 0, rejeitados: 0, ignorados: 0, jaBaixados: 0, jaConciliados: 0, divergentes: 0, canceladasPagas: 0, devolvidos: 0 });

type ContaRemessa = { titularCnpj: string | null; titularNome: string | null; agencia: string | null };

/** Gera a remessa. Trava os títulos e confere dentro da transação, então dois pedidos simultâneos não pagam o mesmo título duas vezes. */
export async function gerarRemessaTx(
  tx: Tx,
  a: { conta: ContaRemessa & { id?: string }; cd: { conta: string; dac: string }; modo: ModoRemessa; dataPagto: Date; ids: string[]; contaId?: string },
) {
  const { conta, cd, modo, dataPagto, ids } = a;
  const contaId = a.contaId ?? conta.id!;
  // Trava os títulos até o fim da transação e só então confere: dois cliques ou dois usuários ao mesmo tempo
  // não geram dois arquivos com o mesmo título (o segundo espera e encontra o pagamento já ativo).
  await tx.$queryRaw`SELECT id FROM "ContaPagar" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  // trava (compartilhada) os favorecidos: alteração de dados bancários em paralelo espera esta remessa terminar
  const favs = await tx.contaPagar.findMany({ where: { id: { in: ids }, fornecedorId: { not: null } }, select: { fornecedorId: true } });
  await travarFornecedores(tx, favs.map((x) => x.fornecedorId!), "SHARE");
  const titulos = await tx.contaPagar.findMany({
    where: { id: { in: ids } },
    include: { fornecedor: true, pagamentos: { where: { status: { in: [...ATIVOS] } }, select: { id: true } } },
  });
  if (titulos.length !== ids.length) throw new ErroNegocio("Algum título selecionado não existe mais. Recarregue a página.");

  const erros: string[] = [];
  const planos = titulos.map((t) => {
    const saldo = r2(toNumber(t.valor) - toNumber(t.valorBaixado));
    const f = formaPrevista(t, t.fornecedor, modo);
    if (t.status !== "ABERTO") erros.push(`${t.descricao}: não está em aberto`);
    else if (!t.aprovadoEm) erros.push(`${t.descricao}: aguardando aprovação do financeiro`);
    else if (t.pagamentos.length) erros.push(`${t.descricao}: já está em outra remessa`);
    else if (saldo <= 0) erros.push(`${t.descricao}: sem saldo a pagar`);
    else if ("erro" in f) erros.push(`${t.descricao}: ${f.erro}`);
    else if (t.fornecedor && situacaoAprovacao(t.fornecedor) !== "APROVADO") {
      erros.push(`${t.descricao}: dados de pagamento de ${t.fornecedor.razaoSocial} alterados e aguardando aprovação (Financeiro > Favorecidos, por outra pessoa)`);
    }
    else if (t.codigoBarras) {
      // boleto com valor/vencimento diferentes do título (cadastrado antes da conferência): o banco pagaria outro valor
      const div = divergenciaBoleto(t.codigoBarras, { valor: toNumber(t.valor), vencimento: t.vencimento });
      if (div) erros.push(`${t.descricao}: ${div}`);
    }
    return { t, saldo, forma: "forma" in f ? f.forma : null };
  });
  if (erros.length) throw new ErroNegocio(`Corrija antes de gerar: ${erros.slice(0, 5).join("; ")}${erros.length > 5 ? ` (+${erros.length - 5})` : ""}.`);

  const rem = await tx.remessaPagamento.create({ data: { contaId, modo, dataPagto, conteudo: "" } });
  const pagamentos: Pagamento[] = [];
  for (const { t, saldo, forma } of planos) {
    const item = await tx.remessaPagamentoItem.create({ data: { remessaId: rem.id, contaPagarId: t.id, forma: forma!, valor: saldo } });
    const f = t.fornecedor!;
    const favorecido = { nome: f.razaoSocial, documento: f.cnpj, banco: f.bancoCodigo, agencia: f.agencia, conta: f.conta, digito: f.contaDigito, chavePix: f.chavePix };
    const seuNumero = `SP${item.id}`;
    if (forma === "30" || forma === "31") {
      // valor nominal do boleto (= valor do título, conferido acima); boleto sem valor impresso: o valor do título
      const valorBarras = lerBoleto(t.codigoBarras!).valor; // Anexo A: com fator < 1000 o valor ocupa as posições 6-19
      pagamentos.push({ forma, seuNumero, data: dataPagto, valor: saldo, codigoBarras: t.codigoBarras!, vencimento: t.vencimento, valorTitulo: valorBarras || toNumber(t.valor), favorecido });
    } else {
      pagamentos.push({ forma: forma as "01" | "41" | "45", seuNumero, data: dataPagto, valor: saldo, favorecido });
    }
  }
  const conteudo = gerarRemessaSispag({ cnpj: conta.titularCnpj!, nome: conta.titularNome!, agencia: conta.agencia!, conta: cd.conta, dac: cd.dac }, pagamentos, new Date());
  await tx.remessaPagamento.update({ where: { id: rem.id }, data: { conteudo } });
  return { remessaId: rem.id, qtd: planos.length, total: planos.reduce((x, p) => x + p.saldo, 0) };
}

/** Gera a remessa a partir do id da conta a debitar: confere que é conta bancária ativa com os dados do titular completos. */
export async function gerarRemessaDaContaTx(tx: Tx, a: { contaId: string; modo: ModoRemessa; dataPagto: Date; ids: string[] }) {
  const conta = await tx.contaBancaria.findUnique({ where: { id: a.contaId } });
  if (!conta?.ativo || conta.tipo !== "BANCO") throw new ErroNegocio("Conta bancária inexistente ou inativa.");
  const cd = contaEDac(conta.numero);
  if (!conta.titularCnpj || !conta.titularNome || !conta.agencia || !cd) {
    throw new ErroNegocio("Complete a conta bancária (agência, conta com dígito, CNPJ e razão social do titular) antes de gerar a remessa.");
  }
  return gerarRemessaTx(tx, { conta, cd, modo: a.modo, dataPagto: a.dataPagto, ids: a.ids });
}

/** Aplica o resultado do retorno: atualiza cada item, baixa os pagos e marca duplicidade (DUP), já conciliado (CONC), divergência (DIV) e remessa cancelada paga (CAN). */
export async function aplicarRetornoTx(tx: Tx, resultados: ResultadoPagamento[], cont: Contagem, cabecalho?: { agencia: string; conta: string; dac: string }): Promise<Set<number>> {
  const remessas = new Set<number>();
  for (const r of resultados) {
    const m = /^SP(\d+)$/.exec(r.seuNumero);
    // Trava o item antes de ler: o mesmo retorno processado duas vezes ao mesmo tempo espera aqui e a segunda vez já o vê PAGO.
    if (m) await tx.$queryRaw`SELECT id FROM "RemessaPagamentoItem" WHERE id = ${Number(m[1])} FOR UPDATE`;
    const item = m ? await tx.remessaPagamentoItem.findUnique({ where: { id: Number(m[1]) }, include: { remessa: { include: { conta: { select: { agencia: true, numero: true, nome: true } } } }, contaPagar: { select: { status: true, valor: true, valorBaixado: true } } } }) : null;
    if (!item) {
      cont.ignorados++;
      continue;
    }
    remessas.add(item.remessaId);
    if (cabecalho) {
      // o retorno precisa ser da conta que gerou a remessa (agência e conta sem zeros à esquerda; DAC só se a conta o tiver)
      const c = item.remessa.conta;
      const num = (c.numero ?? "").replace(/\D/g, "");
      const contaSem = num.slice(0, -1).replace(/^0+/, "");
      const dac = num.slice(-1);
      const ag = (c.agencia ?? "").replace(/\D/g, "").replace(/^0+/, "");
      if (ag !== cabecalho.agencia || contaSem !== cabecalho.conta || (cabecalho.dac && dac !== cabecalho.dac)) {
        throw new ErroNegocio(`O retorno é da agência ${cabecalho.agencia} conta ${cabecalho.conta}-${cabecalho.dac}, mas a remessa #${item.remessaId} foi gerada pela conta "${c.nome}". Confira o arquivo.`);
      }
    }
    if (item.status === "PAGO") {
      // DV/EX depois do "00" (nota 8, obs. A): o dinheiro voltou. Não estorna sozinho (a baixa pode já estar conciliada): marca DEV para o financeiro estornar.
      const atuais = (item.ocorrencias ?? "").split(",");
      if (foiDevolvido(r.ocorrencias) && !atuais.includes("DEV")) {
        await tx.remessaPagamentoItem.update({ where: { id: item.id }, data: { ocorrencias: [...atuais.filter(Boolean), ...r.ocorrencias.filter((c) => !atuais.includes(c)), "DEV"].join(",") } });
        cont.devolvidos++;
      }
      continue; // retorno reprocessado: não baixa de novo
    }
    const status = situacaoRetorno(r.ocorrencias);
    // registro sem ocorrência nenhuma não é informação nova: não tira um item já rejeitado/agendado/cancelado do lugar
    if (r.ocorrencias.length === 0 && item.status !== "ENVIADO") continue;
    // CAN: o banco pagou um item de remessa que foi cancelada aqui (o arquivo chegou a ser enviado): o dinheiro saiu de verdade
    const flags = item.status === "CANCELADO" && status === "PAGO" ? ["CAN"] : [];
    if (flags.length) cont.canceladasPagas++;
    const mudou = await tx.remessaPagamentoItem.updateMany({
      where: { id: item.id, status: { not: "PAGO" } },
      data: { status, ocorrencias: [...r.ocorrencias, ...flags].join(",") || null, nossoNumero: r.nossoNumero || item.nossoNumero },
    });
    if (mudou.count === 0) continue; // outro processamento do mesmo retorno já o marcou PAGO
    if (status === "PAGO") {
      cont.pagos++;
      if (item.contaPagar.status === "ABERTO") {
        const saldoAtual = saldoTitulo(toNumber(item.contaPagar.valor), toNumber(item.contaPagar.valorBaixado));
        const pago = r.valorEfetivo;
        const dif = r2(pago - saldoAtual);
        const intocado = Math.abs(saldoAtual - toNumber(item.valor)) < 0.005; // ninguém mexeu no título desde a remessa
        if (!(pago > 0.004)) {
          // pago sem valor efetivo no retorno: não assume o valor da remessa (pode ter sido parcial). Fica para a conciliação.
          await tx.remessaPagamentoItem.update({ where: { id: item.id }, data: { ocorrencias: [...r.ocorrencias, "DIV"].join(",") } });
          cont.divergentes++;
        } else if (dif > 0.004 && !intocado) {
          // pagou acima do saldo e o título mudou depois da remessa: não dá para saber o que é juros. Fica para a conciliação.
          await tx.remessaPagamentoItem.update({ where: { id: item.id }, data: { ocorrencias: [...r.ocorrencias, "DIV"].join(",") } });
          cont.divergentes++;
        } else {
          await registrarBaixa(tx, {
            tipo: "pagar",
            tituloId: item.contaPagarId,
            contaId: item.remessa.contaId,
            data: r.dataEfetiva ?? item.remessa.dataPagto,
            valor: pago,
            juros: dif > 0.004 ? dif : 0, // acima do saldo: o excedente é juros/encargo cobrado pelo banco/fornecedor
            forma: FORMA_BAIXA[item.forma],
          });
        }
      } else if (
        await pagamentoJaConciliado(tx, { tipo: "pagar", tituloId: item.contaPagarId, contaId: item.remessa.contaId, valor: r.valorEfetivo, data: r.dataEfetiva ?? item.remessa.dataPagto })
      ) {
        // A conciliação do extrato baixou o título antes do retorno chegar, com o mesmo valor e data próxima: é o mesmo pagamento.
        cont.jaConciliados++;
        await tx.remessaPagamentoItem.update({ where: { id: item.id }, data: { ocorrencias: [...r.ocorrencias, ...flags, "CONC"].join(",") } });
      } else {
        // O banco pagou um título que já estava quitado/cancelado aqui: o dinheiro saiu duas vezes. Alerta na remessa e no log.
        cont.jaBaixados++;
        await tx.remessaPagamentoItem.update({ where: { id: item.id }, data: { ocorrencias: [...r.ocorrencias, ...flags, "DUP"].join(",") } });
      }
    } else if (status === "AGENDADO") cont.agendados++;
    else cont.rejeitados++;
  }
  for (const id of remessas) await tx.remessaPagamento.update({ where: { id }, data: { retornoEm: new Date() } });
  return remessas;
}

/** Cancela remessa não enviada/recusada e libera os títulos. Recusa se houver item pago ou agendado. */
export async function cancelarRemessaTx(tx: Tx, remessaId: number, motivo: string) {
  await tx.$queryRaw`SELECT id FROM "RemessaPagamento" WHERE id = ${remessaId} FOR UPDATE`;
  const r = await tx.remessaPagamento.findUnique({ where: { id: remessaId }, include: { itens: { select: { id: true, status: true } } } });
  if (!r) throw new ErroNegocio("Remessa não encontrada.");
  if (r.canceladaEm) throw new ErroNegocio("Esta remessa já foi cancelada.");
  if (r.itens.some((i) => i.status === "PAGO" || i.status === "AGENDADO")) {
    throw new ErroNegocio("Esta remessa já tem pagamentos confirmados ou agendados pelo banco e não pode ser cancelada. Cancele o agendamento no Itaú Empresas.");
  }
  await tx.remessaPagamentoItem.updateMany({ where: { remessaId, status: "ENVIADO" }, data: { status: "CANCELADO" } });
  await tx.remessaPagamento.update({ where: { id: remessaId }, data: { canceladaEm: new Date(), canceladaMotivo: motivo } });
}
