/**
 * Retenção e descarte (LGPD art. 15 e 16; política em docs/LGPD.md §7). Só o que é mecânico e seguro:
 *  - orçamento NÃO aprovado (recusado, ou rascunho/enviado vencido) há mais de N meses perde o nome do paciente
 *    (anonimização: o orçamento continua para estatística comercial, sem titular);
 *  - observação antiga do kardex que levava o nome do paciente no consumo direto passa a citar só a cirurgia.
 * Cirurgia, consumo, lote e recolhimento NÃO são descartados: rastreabilidade sanitária (art. 16 I, obrigação regulatória).
 * Usado por scripts/lgpd-retencao.ts (sem "server-only") e pelos testes.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Cliente = Pick<PrismaClient, "orcamento" | "$executeRaw">;

/** Padrão da política (docs/LGPD.md §7). Mudar aqui e no documento juntos. */
export const MESES_ORCAMENTO_NAO_APROVADO = 6;

/** Mesmo dia `meses` antes de `agora` (UTC). */
export function mesesAntes(agora: Date, meses: number): Date {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d;
}

/** Orçamentos com paciente que já passaram do prazo: RECUSADO criado antes do limite; RASCUNHO/ENVIADO vencido antes do limite (sem validade: criado antes). */
export function filtroOrcamentosVencidos(limite: Date): Prisma.OrcamentoWhereInput {
  return {
    paciente: { not: null },
    OR: [
      { status: "RECUSADO", criadoEm: { lt: limite } },
      { status: { in: ["RASCUNHO", "ENVIADO"] }, validade: { lt: limite } },
      { status: { in: ["RASCUNHO", "ENVIADO"] }, validade: null, criadoEm: { lt: limite } },
    ],
  };
}

/** `escopo` restringe o universo (os testes rodam no banco compartilhado e só mexem nos próprios registros). */
export async function orcamentosParaAnonimizar(c: Cliente, agora = new Date(), meses = MESES_ORCAMENTO_NAO_APROVADO, escopo: Prisma.OrcamentoWhereInput = {}) {
  return c.orcamento.findMany({ where: { AND: [escopo, filtroOrcamentosVencidos(mesesAntes(agora, meses))] }, select: { id: true, status: true, criadoEm: true, validade: true }, orderBy: { id: "asc" } });
}

/** Apaga o nome do paciente dos orçamentos vencidos. O filtro é refeito no UPDATE: o que foi aprovado no meio não é tocado. */
export async function anonimizarOrcamentos(c: Cliente, agora = new Date(), meses = MESES_ORCAMENTO_NAO_APROVADO, escopo: Prisma.OrcamentoWhereInput = {}) {
  const alvo = await orcamentosParaAnonimizar(c, agora, meses, escopo);
  if (alvo.length === 0) return { ids: [] as number[], count: 0 };
  const r = await c.orcamento.updateMany({ where: { AND: [{ id: { in: alvo.map((o) => o.id) } }, filtroOrcamentosVencidos(mesesAntes(agora, meses))] }, data: { paciente: null } });
  return { ids: alvo.map((o) => o.id), count: r.count };
}

/** Kardex: "Consumo direto — paciente <nome>" (gravado até 16/10/2026) vira "Consumo direto na cirurgia CIR-n". Idempotente. */
export async function limparPacienteDoKardex(c: Cliente, loteId?: string): Promise<number> {
  if (loteId) return c.$executeRaw`UPDATE "Movimento" SET observacao = 'Consumo direto na cirurgia ' || COALESCE(documento, '?') WHERE observacao LIKE 'Consumo direto — paciente %' AND "loteId" = ${loteId}`;
  return c.$executeRaw`UPDATE "Movimento" SET observacao = 'Consumo direto na cirurgia ' || COALESCE(documento, '?') WHERE observacao LIKE 'Consumo direto — paciente %'`;
}
