import "server-only";
import type { Perfil } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";

export type DadosUsuario = { nome: string; perfil: Perfil; ativo: boolean };

/**
 * Edita nome/perfil/ativo de um usuário (docs/REVISAO.md §19, S7/S8):
 * - nunca deixa o sistema sem ADMIN ativo: trava as linhas dos ADMIN ativos e do alvo (dois admins rebaixando um ao
 *   outro ao mesmo tempo não zeram a administração);
 * - mudar perfil ou desativar sobe a sessaoVersao: o cookie antigo não volta a valer se a conta for reativada.
 * Devolve o texto "campo: antes → depois" para a auditoria.
 */
export async function editarUsuarioTx(tx: Tx, adminId: string, id: string, d: DadosUsuario): Promise<{ email: string; mudou: string }> {
  if (id === adminId && (!d.ativo || d.perfil !== "ADMIN")) throw new ErroNegocio("Você não pode desativar nem tirar o perfil de administrador da sua própria conta.");
  await tx.$queryRaw`SELECT id FROM "Usuario" WHERE (perfil = 'ADMIN' AND ativo) OR id = ${id} ORDER BY id FOR UPDATE`;
  const antes = await tx.usuario.findUnique({ where: { id }, select: { nome: true, perfil: true, ativo: true } });
  if (!antes) throw new ErroNegocio("Usuário não encontrado.");
  const eraAdminAtivo = antes.perfil === "ADMIN" && antes.ativo;
  const continuaAdminAtivo = d.perfil === "ADMIN" && d.ativo;
  if (eraAdminAtivo && !continuaAdminAtivo) {
    const outros = await tx.usuario.count({ where: { perfil: "ADMIN", ativo: true, id: { not: id } } });
    if (outros === 0) throw new ErroNegocio("Este é o último administrador ativo: crie ou ative outro antes.");
  }
  const derruba = antes.perfil !== d.perfil || (antes.ativo && !d.ativo);
  const u = await tx.usuario.update({ where: { id }, data: { ...d, ...(derruba ? { sessaoVersao: { increment: 1 } } : {}) } });
  const mudou = (["nome", "perfil", "ativo"] as const).filter((k) => antes[k] !== u[k]).map((k) => `${k}: ${antes[k]} → ${u[k]}`);
  return { email: u.email, mudou: mudou.join("; ") };
}
