/**
 * Contenção de incidente (docs/LGPD.md §10, passo 2): invalida as sessões abertas subindo Usuario.sessaoVersao.
 * O JWT leva a versão e src/lib/auth.ts (getUser) recusa versão diferente na requisição seguinte: todos voltam ao login.
 *   OPERADOR="Nome" npx tsx scripts/derrubar-sessoes.ts --todos [--motivo="incidente 2026-10-16"]
 *   OPERADOR="Nome" npx tsx scripts/derrubar-sessoes.ts --email=fulano@empresa.com [--desativar]
 * Atenção: isto NÃO troca o AUTH_SECRET. Se houver suspeita de vazamento da chave, troque-a também (passo 3), porque
 * com ela alguém forja um cookie com a versão nova. --desativar bloqueia a conta (só com --email).
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { argumentos, auditarScript } from "./_lgpd-comum";

async function main() {
  const a = argumentos();
  const motivo = (a.motivo ?? "contenção de incidente").slice(0, 300);
  if (a.todos && !a.email) {
    if (a.desativar) throw new Error("--desativar só vale com --email (não bloqueie todos de uma vez, inclusive o admin).");
    const n = await db.usuario.updateMany({ data: { sessaoVersao: { increment: 1 } } });
    await auditarScript("derrubar sessões", "Usuario", null, `todas as sessões invalidadas (${n.count} usuário(s)); motivo: ${motivo}`);
    console.log(`${n.count} usuário(s): todas as sessões invalidadas. Cada um entra de novo com a senha.`);
    return;
  }
  if (a.email && !a.todos) {
    const email = a.email.trim().toLowerCase();
    const u = await db.usuario.findUnique({ where: { email }, select: { id: true, perfil: true, ativo: true } });
    if (!u) throw new Error(`Usuário ${email} não encontrado.`);
    if (a.desativar && u.perfil === "ADMIN" && u.ativo && (await db.usuario.count({ where: { perfil: "ADMIN", ativo: true } })) <= 1) {
      throw new Error("É o único ADMIN ativo: crie outro administrador (npm run admin:criar) antes de desativar este.");
    }
    await db.usuario.update({ where: { id: u.id }, data: { sessaoVersao: { increment: 1 }, ...(a.desativar ? { ativo: false } : {}) } });
    await auditarScript("derrubar sessões", "Usuario", u.id, `sessões invalidadas${a.desativar ? " e conta desativada" : ""}; motivo: ${motivo}`);
    console.log(`Sessões de ${email} invalidadas${a.desativar ? " e conta desativada" : ""}.`);
    return;
  }
  throw new Error("Use --todos ou --email=<e-mail> (um dos dois).");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
