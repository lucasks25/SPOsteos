import "server-only";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { money } from "@/lib/format";
import { listarContas } from "./contas";
import { garantirMesAberto } from "./fechamento";
import { validarClassificacao } from "./plano";

/** Regras de conta bancária e lançamento avulso que mexem no banco. Ficam fora de "use server" para serem testadas sem login. */

/** Lançamento sem título (tarifa, rendimento...) numa conta ativa, em mês aberto. */
export async function lancarAvulsoTx(tx: Tx, contaId: string, d: { sentido: "ENTRADA" | "SAIDA"; descricao: string; planoContaId: string; centroCustoId: string | null; valor: number; data: Date }) {
  const conta = await tx.contaBancaria.findUnique({ where: { id: contaId }, select: { ativo: true } });
  if (!conta?.ativo) throw new ErroNegocio("Conta inexistente ou inativa.");
  await validarClassificacao(tx, d.planoContaId, d.centroCustoId);
  await garantirMesAberto(tx, [d.data], "lançar nessa data");
  return tx.lancamento.create({ data: { contaId, ...d } });
}

/** Exclui um lançamento avulso não conciliado. Baixas de título e transferências são estornadas pelo próprio dono. Devolve a conta. */
export async function excluirLancamentoAvulsoTx(tx: Tx, id: string): Promise<string> {
  const l = await tx.lancamento.findUnique({ where: { id }, select: { contaId: true, data: true, contaReceberId: true, contaPagarId: true, transferenciaId: true, extrato: { select: { id: true } } } });
  if (!l) throw new ErroNegocio("Lançamento não encontrado.");
  if (l.transferenciaId) throw new ErroNegocio("Este lançamento é parte de uma transferência. Estorne a transferência inteira.");
  if (l.contaReceberId || l.contaPagarId) throw new ErroNegocio("Este lançamento é baixa de título. Estorne pela tela do título.");
  if (l.extrato) throw new ErroNegocio("Lançamento conciliado com o extrato. Desfaça a conciliação antes.");
  await garantirMesAberto(tx, [l.data], "excluir lançamento dessa data");
  await tx.lancamento.delete({ where: { id } });
  return l.contaId;
}

/** Ativa ou inativa a conta. Devolve o estado anterior e o nome (para a auditoria). */
export async function alternarAtivoContaTx(tx: Tx, id: string) {
  const c = await tx.contaBancaria.findUniqueOrThrow({ where: { id } });
  if (c.ativo) {
    // conta inativa sai do saldo, do painel e do fluxo: com saldo diferente de zero, os números deixariam de fechar
    const conta = (await listarContas()).find((x) => x.id === id);
    if (conta && Math.abs(conta.saldo) >= 0.005) throw new ErroNegocio(`A conta tem saldo de ${money(conta.saldo)}. Zere o saldo (transferência ou lançamento) antes de inativá-la.`);
  }
  await tx.contaBancaria.update({ where: { id }, data: { ativo: !c.ativo } });
  return { eraAtiva: c.ativo, nome: c.nome };
}
