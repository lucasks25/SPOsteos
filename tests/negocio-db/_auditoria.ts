/**
 * Limpeza de LogAuditoria nos testes. A tabela é imutável (trigger da migration 20261016235000_lgpd_auditoria_imutavel):
 * só o dono da tabela, com `opme.manutencao_auditoria = on` na própria transação, apaga. No banco local o usuário do
 * .env é o dono; em produção o papel da aplicação (scripts/db-papel-app.sql) não é, e esta exceção não vale.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** Apaga as linhas de auditoria do filtro e, na mesma transação, os usuários de teste indicados (FK Restrict). */
export async function apagarAuditoriaTeste(where: Prisma.LogAuditoriaWhereInput, usuarios?: Prisma.UsuarioWhereInput) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('opme.manutencao_auditoria', 'on', true)`;
    await tx.logAuditoria.deleteMany({ where });
    if (usuarios) {
      const ids = (await tx.usuario.findMany({ where: usuarios, select: { id: true } })).map((u) => u.id);
      if (ids.length) {
        await tx.logAuditoria.deleteMany({ where: { usuarioId: { in: ids } } });
        await tx.usuario.deleteMany({ where: { id: { in: ids } } });
      }
    }
  });
}
