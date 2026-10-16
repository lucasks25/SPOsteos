import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { toNumber } from "@/lib/format";
import { divergenciaBoleto } from "./boleto";
import type { Tipo } from "./config";
import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";

/** Regras de criar, editar, cancelar e classificar título que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */

type DadosReceber = { descricao: string; hospitalId: string | null; planoContaId: string; centroCustoId: string | null; competencia: Date; valor: number; vencimento: Date };
type DadosPagar = { descricao: string; fornecedorId: string | null; planoContaId: string; centroCustoId: string | null; competencia: Date; codigoBarras: string | null; valor: number; vencimento: Date };

/** Situações do boleto em que o banco tem (ou vai ter) o título registrado com valor e vencimento: o título não pode divergir dele. */
const BOLETO_NO_BANCO = ["ENVIADO", "REGISTRADO", "BAIXA_ENVIADA"];
const cent = (n: number) => Math.round(n * 100);

/** Competência atual do título (para recusar mudanças em mês fechado). */
async function competenciaDo(tx: Tx, tipo: Tipo, id: string): Promise<Date | null> {
  const sel = { competencia: true } as const;
  const t = tipo === "receber" ? await tx.contaReceber.findUnique({ where: { id }, select: sel }) : await tx.contaPagar.findUnique({ where: { id }, select: sel });
  return t?.competencia ?? null;
}

/** Trava a linha do título até o fim da transação (a remessa SISPAG e a de cobrança travam a mesma linha). */
async function travar(tx: Tx, tipo: Tipo, id: string) {
  if (tipo === "receber") await tx.$queryRaw`SELECT id FROM "ContaReceber" WHERE id = ${id} FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM "ContaPagar" WHERE id = ${id} FOR UPDATE`;
}

/** Recusa mexer em conta a pagar que está numa remessa SISPAG ativa: o arquivo pode já estar no banco com o valor antigo. */
async function exigirForaDeRemessa(tx: Tx, contaPagarId: string, acao: string) {
  const item = await tx.remessaPagamentoItem.findFirst({ where: { contaPagarId, status: { in: ["ENVIADO", "AGENDADO"] } }, select: { remessaId: true, status: true } });
  if (item) {
    throw new ErroNegocio(
      `Esta conta está na remessa SISPAG #${item.remessaId} (${item.status === "AGENDADO" ? "agendada no banco" : "gerada/enviada"}): não é possível ${acao}. ` +
        "Cancele a remessa (se ainda não foi ao banco) ou aguarde e importe o retorno.",
    );
  }
}

/** Cria (id = null) ou edita um título a receber em aberto e sem baixas. Devolve o id. */
export async function salvarContaReceberTx(tx: Tx, id: string | null, data: DadosReceber): Promise<string> {
  await validarClassificacao(tx, data.planoContaId, data.centroCustoId);
  if (id) await travar(tx, "receber", id);
  await garantirMesAberto(tx, [data.competencia, id ? await competenciaDo(tx, "receber", id) : null], "criar ou alterar título nessa competência");
  if (!id) return (await tx.contaReceber.create({ data })).id;
  const atual = await tx.contaReceber.findUnique({ where: { id }, select: { valor: true, vencimento: true, hospitalId: true, cobrancaStatus: true, competencia: true, pedido: { select: { id: true, status: true } } } });
  if (atual?.pedido?.status === "FATURADO") {
    // Título de NF: valor, competência e hospital são os da nota (receita do DRE = vendas do pedido; o CMV fica na data da NF).
    const mudouNf = cent(toNumber(atual.valor)) !== cent(data.valor) || atual.competencia?.getTime() !== data.competencia?.getTime() || atual.hospitalId !== data.hospitalId;
    if (mudouNf) {
      throw new ErroNegocio(
        `Este título veio da NF do pedido PV-${atual.pedido.id}: valor, competência e hospital seguem a nota e não podem mudar aqui (o DRE ficaria diferente das vendas). ` +
          "Diferença de valor recebido se resolve na baixa (desconto, juros) ou como glosa; vencimento, descrição e classificação podem ser alterados.",
      );
    }
  }
  if (atual?.cobrancaStatus && BOLETO_NO_BANCO.includes(atual.cobrancaStatus)) {
    const mudou = cent(toNumber(atual.valor)) !== cent(data.valor) || atual.vencimento.getTime() !== data.vencimento.getTime() || atual.hospitalId !== data.hospitalId;
    if (mudou) {
      throw new ErroNegocio(
        "Este título tem boleto no banco (cobrança): valor, vencimento e hospital não podem mudar aqui, senão o boleto cobraria um valor diferente do título. " +
          "Peça a baixa do boleto na tela de cobrança e gere um novo depois (descrição e classificação podem ser alteradas).",
      );
    }
  }
  const r = await tx.contaReceber.updateMany({ where: { id, status: "ABERTO", valorBaixado: null }, data });
  if (r.count === 0) throw new ErroNegocio("Só é possível editar títulos em aberto e sem baixas. Estorne as baixas antes.");
  return id;
}

/**
 * Cria (id = null) ou edita uma conta a pagar em aberto e sem baixas.
 * Segregação de funções (docs/REVISAO.md §21): conta criada à mão nasce NÃO aprovada (como as geradas por compras) e
 * guarda quem criou; editar valor, vencimento, fornecedor ou boleto registra o editor em `alteradoPor` e, se a conta
 * estava aprovada, remove a aprovação (`info.aprovacaoRemovida`, para a auditoria). Quem criou/alterou não aprova.
 * Com boleto: o valor e o vencimento do código de barras têm de ser os do título. Conta em remessa SISPAG ativa não muda.
 */
export async function salvarContaPagarTx(tx: Tx, id: string | null, data: DadosPagar, usuarioId: string, info: { aprovacaoRemovida?: boolean } = {}): Promise<string> {
  await validarClassificacao(tx, data.planoContaId, data.centroCustoId);
  if (data.codigoBarras) {
    const erro = divergenciaBoleto(data.codigoBarras, data);
    if (erro) throw new ErroNegocio(erro);
  }
  if (id) {
    await travar(tx, "pagar", id);
    await exigirForaDeRemessa(tx, id, "alterar");
  }
  await garantirMesAberto(tx, [data.competencia, id ? await competenciaDo(tx, "pagar", id) : null], "criar ou alterar título nessa competência");
  if (!id) return (await tx.contaPagar.create({ data: { ...data, criadoPor: usuarioId } })).id;
  const atual = await tx.contaPagar.findUnique({ where: { id }, select: { valor: true, vencimento: true, fornecedorId: true, codigoBarras: true, aprovadoEm: true, alteradoPor: true } });
  const mudouPagamento =
    !!atual &&
    (cent(toNumber(atual.valor)) !== cent(data.valor) || atual.vencimento.getTime() !== data.vencimento.getTime() || atual.fornecedorId !== data.fornecedorId || atual.codigoBarras !== data.codigoBarras);
  const segregacao = mudouPagamento && atual
    ? { alteradoPor: [...new Set([...atual.alteradoPor, usuarioId])], ...(atual.aprovadoEm ? { aprovadoEm: null, aprovadoPor: null } : {}) }
    : {};
  const r = await tx.contaPagar.updateMany({ where: { id, status: "ABERTO", valorBaixado: null }, data: { ...data, ...segregacao } });
  if (r.count === 0) throw new ErroNegocio("Só é possível editar títulos em aberto e sem baixas. Estorne as baixas antes.");
  info.aprovacaoRemovida = mudouPagamento && !!atual?.aprovadoEm;
  return id;
}

/** Cancela um título em aberto e sem baixas (conta a pagar: também fora de remessa SISPAG ativa). */
export async function cancelarTituloTx(tx: Tx, tipo: Tipo, id: string) {
  const data = { status: "CANCELADO" as const };
  await travar(tx, tipo, id);
  if (tipo === "pagar") await exigirForaDeRemessa(tx, id, "cancelar");
  await garantirMesAberto(tx, [await competenciaDo(tx, tipo, id)], "cancelar título dessa competência");
  if (tipo === "receber") {
    // Cancelar a receita de uma NF emitida tiraria a venda do DRE e deixaria o custo (CMV): precisa de cancelamento de NF/devolução.
    const t = await tx.contaReceber.findUnique({ where: { id }, select: { pedido: { select: { status: true } } } });
    if (t?.pedido?.status === "FATURADO") throw new ErroNegocio("Este título vem de uma NF emitida. Para desfazê-lo é preciso cancelar a NF ou registrar uma devolução.");
  }
  const where = { id, status: "ABERTO" as const, valorBaixado: null };
  const r = tipo === "receber" ? await tx.contaReceber.updateMany({ where, data }) : await tx.contaPagar.updateMany({ where, data });
  if (r.count === 0) throw new ErroNegocio("Só é possível cancelar títulos em aberto e sem baixas. Estorne as baixas antes.");
}

/**
 * Classifica (ou reclassifica) um título em qualquer situação: não mexe em valor nem em baixas.
 * Trocar o centro de custo também move, no DRE por centro, os juros/multa/desconto das baixas e as glosas (que caem na
 * data delas): por isso a troca é recusada se alguma baixa ou glosa estiver em mês fechado.
 */
export async function classificarTituloTx(tx: Tx, tipo: Tipo, id: string, data: { planoContaId: string; centroCustoId: string | null; competencia: Date }) {
  await validarClassificacao(tx, data.planoContaId, data.centroCustoId);
  await travar(tx, tipo, id);
  await garantirMesAberto(tx, [data.competencia, await competenciaDo(tx, tipo, id)], "reclassificar título dessa competência");
  const sel = { centroCustoId: true } as const;
  const atual = tipo === "receber" ? await tx.contaReceber.findUnique({ where: { id }, select: sel }) : await tx.contaPagar.findUnique({ where: { id }, select: sel });
  if (!atual) throw new ErroNegocio("Título não encontrado.");
  if (atual.centroCustoId !== data.centroCustoId) {
    const baixas = await tx.lancamento.findMany({ where: tipo === "receber" ? { contaReceberId: id } : { contaPagarId: id }, select: { data: true } });
    const glosas = tipo === "receber" ? await tx.glosa.findMany({ where: { contaReceberId: id }, select: { data: true } }) : [];
    await garantirMesAberto(tx, [...baixas, ...glosas].map((x) => x.data), "trocar o centro de custo de título com baixa ou glosa nesse mês");
  }
  const r = tipo === "receber" ? await tx.contaReceber.updateMany({ where: { id }, data }) : await tx.contaPagar.updateMany({ where: { id }, data });
  if (r.count === 0) throw new ErroNegocio("Título não encontrado.");
}

const CAMPOS_TITULO = ["descricao", "valor", "vencimento", "competencia", "hospitalId", "fornecedorId", "codigoBarras", "planoContaId", "centroCustoId"] as const;
const fmtCampo = (v: unknown) => (v === null || v === undefined ? "vazio" : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" ? String(toNumber(v as never)) : String(v));

/**
 * Texto "campo: antes → depois" da edição de um título, para a auditoria (governança: quem mudou valor, vencimento,
 * favorecido ou boleto). Chame dentro da mesma transação, antes de salvar; trava a linha como o salvar.
 */
export async function diferencasTitulo(tx: Tx, tipo: Tipo, id: string, novo: Partial<Record<(typeof CAMPOS_TITULO)[number], unknown>>): Promise<string> {
  await travar(tx, tipo, id);
  const atual = (tipo === "receber" ? await tx.contaReceber.findUnique({ where: { id } }) : await tx.contaPagar.findUnique({ where: { id } })) as Record<string, unknown> | null;
  if (!atual) return "";
  return CAMPOS_TITULO.filter((k) => k in novo && fmtCampo(atual[k]) !== fmtCampo(novo[k]))
    .map((k) => `${k}: ${fmtCampo(atual[k])} → ${fmtCampo(novo[k])}`)
    .join("; ");
}
