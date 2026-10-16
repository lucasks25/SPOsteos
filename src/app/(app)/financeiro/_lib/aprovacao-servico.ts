import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

/**
 * "Versão" do que o aprovador confere: valor, vencimento, fornecedor e boleto. A tela manda a versão que mostrou; se a
 * conta mudou depois, a aprovação é recusada (não se aprova o que não se viu; mesmo princípio do favorecido, §19 S2).
 */
export function versaoAprovacao(c: { valor: { toString(): string } | number; vencimento: Date; fornecedorId: string | null; codigoBarras: string | null }): string {
  const texto = [Math.round(Number(c.valor.toString()) * 100), c.vencimento.toISOString(), c.fornecedorId ?? "", c.codigoBarras ?? ""].join("|");
  return createHash("sha256").update(texto, "utf8").digest("hex").slice(0, 16);
}

export const MSG_AUTOR_NAO_APROVA = "Quem criou ou alterou a conta não pode aprová-la; peça a outra pessoa do financeiro.";

/** Quem responde pela conta até a aprovação: quem criou à mão e quem alterou campos de pagamento desde a última aprovação. */
export const autoresConta = (c: { criadoPor: string | null; alteradoPor: string[] }): string[] => [...new Set([c.criadoPor, ...c.alteradoPor].filter((x): x is string => !!x))];

/**
 * Exceção da segregação (docs/REVISAO.md §21): empresa com uma pessoa só no financeiro. O ADMIN pode aprovar o que ele
 * mesmo criou/alterou quando não há outro usuário FINANCEIRO ativo para fazer a segunda checagem.
 */
export async function podeAprovarPropria(tx: Tx, usuarioId: string): Promise<boolean> {
  const u = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { perfil: true, ativo: true } });
  if (u?.perfil !== "ADMIN" || !u.ativo) return false;
  return (await tx.usuario.count({ where: { perfil: "FINANCEIRO", ativo: true, id: { not: usuarioId } } })) === 0;
}

/**
 * Aprova contas a pagar abertas e ainda não aprovadas. Devolve quantas foram aprovadas; recusa se nenhuma pôde ser.
 * Segregação de funções: recusa o lote inteiro se o aprovador criou ou alterou (valor, vencimento, fornecedor, boleto)
 * alguma das contas, salvo a exceção de `podeAprovarPropria`. Aprovar zera `alteradoPor` (o aprovador respondeu pelas edições).
 * As linhas são travadas antes da leitura: uma edição simultânea espera. Com `versoesVistas` (a tela sempre manda), recusa
 * o lote se alguma conta mudou depois que o aprovador a viu (`versaoAprovacao`).
 * Não confere mês fechado (decisão de 16/10/2026): aprovar só libera a conta para o SISPAG, não muda DRE nem caixa;
 * a baixa, quando vier, é que respeita o fechamento pela data do pagamento.
 */
export async function aprovarContasPagarTx(tx: Tx, ids: string[], usuarioId: string, versoesVistas?: Record<string, string>): Promise<number> {
  if (ids.length === 0) throw new ErroNegocio("Selecione ao menos uma conta.");
  if (ids.length > 500) throw new ErroNegocio("Máximo de 500 por vez.");
  const lista = [...new Set(ids)].sort();
  await tx.$queryRaw`SELECT id FROM "ContaPagar" WHERE id IN (${Prisma.join(lista)}) ORDER BY id FOR UPDATE`;
  const pendentes = await tx.contaPagar.findMany({ where: { id: { in: lista }, aprovadoEm: null, status: "ABERTO" }, select: { id: true, descricao: true, criadoPor: true, alteradoPor: true, valor: true, vencimento: true, fornecedorId: true, codigoBarras: true } });
  if (pendentes.length === 0) throw new ErroNegocio("Nada a aprovar: as contas já foram aprovadas, pagas ou canceladas.");
  if (versoesVistas) {
    const mudou = pendentes.filter((c) => versoesVistas[c.id] !== versaoAprovacao(c));
    if (mudou.length > 0) {
      throw new ErroNegocio(
        `A conta "${mudou[0].descricao}"${mudou.length > 1 ? ` e mais ${mudou.length - 1}` : ""} mudou (valor, vencimento, fornecedor ou boleto) depois que a tela foi aberta. ` +
          "Nada foi aprovado: recarregue a página e confira de novo.",
      );
    }
  }
  const proprias = pendentes.filter((c) => autoresConta(c).includes(usuarioId));
  if (proprias.length > 0 && !(await podeAprovarPropria(tx, usuarioId))) {
    const nomes = proprias.slice(0, 3).map((c) => `"${c.descricao}"`).join(", ");
    throw new ErroNegocio(`${MSG_AUTOR_NAO_APROVA} Conta(s): ${nomes}${proprias.length > 3 ? ` e mais ${proprias.length - 3}` : ""}. Desmarque-as para aprovar as demais.`);
  }
  const r = await tx.contaPagar.updateMany({
    where: { id: { in: pendentes.map((c) => c.id) }, aprovadoEm: null, status: "ABERTO" },
    data: { aprovadoEm: new Date(), aprovadoPor: usuarioId, alteradoPor: [] },
  });
  return r.count;
}

/** Texto "criada por X · alterada por Y" para mostrar ao lado da aprovação (ids que não são usuário aparecem como estão). */
export async function rotulosAutoria(tx: Tx, contas: { id: string; criadoPor: string | null; alteradoPor: string[]; aprovadoPor?: string | null }[]): Promise<Map<string, string>> {
  const ids = [...new Set(contas.flatMap((c) => [...autoresConta(c), ...(c.aprovadoPor ? [c.aprovadoPor] : [])]))];
  const usuarios = ids.length ? await tx.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nome = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? id;
  return new Map(
    contas.map((c) => {
      const partes = [c.criadoPor ? `criada por ${nome(c.criadoPor)}` : "gerada pelo sistema", ...(c.alteradoPor.length ? [`alterada por ${c.alteradoPor.map(nome).join(", ")}`] : []), ...(c.aprovadoPor ? [`aprovada por ${nome(c.aprovadoPor)}`] : [])];
      return [c.id, partes.join(" · ")];
    }),
  );
}
