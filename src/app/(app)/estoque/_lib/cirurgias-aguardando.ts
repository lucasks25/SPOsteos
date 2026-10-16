import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { periodo } from "@/lib/datas";

type Cliente = Pick<Prisma.TransactionClient, "cirurgia">;

/**
 * Fila do estoque: cirurgias AGENDADA/CONFIRMADA sem remessa ativa (qualquer status diferente de CANCELADA).
 * REALIZADA, FATURADA e CANCELADA nunca entram (o material já foi usado ou a cirurgia não vai acontecer).
 * Leitura de tabela do comercial (permitida); a criação do vale é da tela de nova remessa do estoque.
 */
export async function cirurgiasAguardandoVale(
  c: Cliente,
  filtro: { hospitalId?: string; de?: string; ate?: string } = {},
  limite = 200,
) {
  const p = periodo(filtro.de, filtro.ate);
  return c.cirurgia.findMany({
    where: {
      status: { in: ["AGENDADA", "CONFIRMADA"] },
      remessas: { none: { status: { not: "CANCELADA" } } },
      ...(filtro.hospitalId ? { hospitalId: filtro.hospitalId } : {}),
      ...(p.gte || p.lt ? { dataHora: { ...(p.gte ? { gte: p.gte } : {}), ...(p.lt ? { lt: p.lt } : {}) } } : {}),
    },
    select: {
      id: true,
      numero: true,
      paciente: true,
      dataHora: true,
      status: true,
      hospital: { select: { razaoSocial: true, nomeFantasia: true } },
      medico: { select: { nome: true } },
      procedimento: { select: { descricao: true, _count: { select: { itens: true } } } },
    },
    orderBy: { dataHora: "asc" },
    take: limite,
  });
}
