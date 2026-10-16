import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/forms";

export const MAX_FALHAS = 5;
// por IP o limite é maior: o escritório inteiro sai pelo mesmo IP (NAT), e 5 erros de colegas bloqueavam todo mundo,
// inclusive quem acertava a senha (revisão independente, docs/REVISAO.md §19). Ainda contém senha espalhada por e-mails.
export const MAX_FALHAS_IP = 30;
export const JANELA_MS = 15 * 60 * 1000;
// hash de uma senha qualquer: quando o e-mail não existe, comparamos contra ele para o tempo de resposta não revelar isso
const HASH_FALSO = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4cF5L8lq7sQ3nZ0f6m9xYk0m2d8e";

export const MSG_INVALIDO = "E-mail ou senha inválidos.";
export const MSG_BLOQUEADO = "Muitas tentativas. Aguarde 15 minutos e tente de novo.";

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Texto do campo e-mail que vai para a auditoria do login falho. Quem digita a senha no campo errado não pode deixá-la
 * gravada no log (docs/REVISAO.md §19.1): só vai se tiver formato de e-mail, em minúsculas e com no máximo 254 caracteres.
 */
export function emailParaAuditoria(texto: string): string {
  const e = texto.trim().toLowerCase();
  return e.length <= 254 && FORMATO_EMAIL.test(e) ? e : "(não é um e-mail)";
}

export type ResultadoLogin = { ok: true; user: { id: string; sessaoVersao: number } } | { ok: false; erro: string };

/** Confere e-mail e senha com limite de tentativas por e-mail (e por IP, quando há um confiável). Sem cookie nem redirect. */
export async function autenticar(emailBruto: string, senhaBruta: string, ip: string | null): Promise<ResultadoLogin> {
  const email = emailBruto.trim().toLowerCase().slice(0, 200);
  const senha = senhaBruta.slice(0, 200);
  if (!email || !senha) return { ok: false, erro: "Informe e-mail e senha." };
  const chaves = [`email:${email}`, ...(ip ? [`ip:${ip}`] : [])];
  const desde = new Date(Date.now() - JANELA_MS);
  // Reserva a tentativa ANTES de conferir a senha e conta incluindo a própria: numa rajada simultânea, a k-ésima
  // reserva gravada enxerga ao menos k linhas, então no máximo MAX_FALHAS conferem a senha. (Contar antes e gravar
  // só na falha deixava 20 pedidos paralelos passarem todos: docs/REVISAO.md §19, S3.)
  const reservas = await db.tentativaLogin.createManyAndReturn({ data: chaves.map((chave) => ({ chave })), select: { id: true } });
  const ids = reservas.map((r) => r.id);
  const porChave = await db.tentativaLogin.groupBy({ by: ["chave"], where: { chave: { in: chaves }, criadaEm: { gte: desde } }, _count: true });
  if (porChave.some((c) => c._count > (c.chave.startsWith("ip:") ? MAX_FALHAS_IP : MAX_FALHAS))) {
    await db.tentativaLogin.deleteMany({ where: { id: { in: ids } } }); // bloqueada não conta: não prolonga o bloqueio
    return { ok: false, erro: MSG_BLOQUEADO };
  }

  const user = await db.usuario.findUnique({ where: { email } });
  const senhaOk = await bcrypt.compare(senha, user?.senhaHash ?? HASH_FALSO);
  if (!user || !user.ativo || !senhaOk) {
    await audit(null, "login falhou", "Usuario", undefined, emailParaAuditoria(emailBruto)); // a reserva fica como registro da falha
    return { ok: false, erro: MSG_INVALIDO };
  }
  await db.tentativaLogin.deleteMany({ where: { OR: [{ id: { in: ids } }, { chave: `email:${email}` }] } });
  await db.tentativaLogin.deleteMany({ where: { criadaEm: { lt: desde } } });
  return { ok: true, user: { id: user.id, sessaoVersao: user.sessaoVersao } };
}

export const SENHA_MIN = 10;
export const SENHA_MAX = 72; // limite real do bcrypt

/**
 * Troca da própria senha: exige a senha atual (com o mesmo limite de tentativas, por usuário: sessão roubada não vira
 * força bruta da senha), recusa repetir a atual, grava bcrypt e sobe a sessaoVersao (derruba as outras sessões).
 * Devolve a nova versão para o chamador recriar o cookie deste aparelho.
 */
export async function trocarSenha(userId: string, atual: string, nova: string): Promise<{ ok: true; sessaoVersao: number } | { ok: false; erro: string; campo?: "atual" | "nova" }> {
  if (nova.length < SENHA_MIN || nova.length > SENHA_MAX) return { ok: false, erro: `A nova senha precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`, campo: "nova" };
  if (nova === atual) return { ok: false, erro: "A nova senha tem de ser diferente da atual.", campo: "nova" };
  const chave = `senha:${userId}`;
  const desde = new Date(Date.now() - JANELA_MS);
  const reserva = await db.tentativaLogin.create({ data: { chave }, select: { id: true } });
  if ((await db.tentativaLogin.count({ where: { chave, criadaEm: { gte: desde } } })) > MAX_FALHAS) {
    await db.tentativaLogin.delete({ where: { id: reserva.id } });
    return { ok: false, erro: MSG_BLOQUEADO };
  }
  const user = await db.usuario.findUnique({ where: { id: userId }, select: { senhaHash: true, ativo: true } });
  if (!user?.ativo || !(await bcrypt.compare(atual.slice(0, 200), user.senhaHash))) {
    await audit(userId, "trocar senha falhou", "Usuario", userId, "senha atual incorreta");
    return { ok: false, erro: "Senha atual incorreta.", campo: "atual" };
  }
  const salvo = await db.usuario.update({ where: { id: userId }, data: { senhaHash: await bcrypt.hash(nova, 10), sessaoVersao: { increment: 1 } }, select: { sessaoVersao: true } });
  await db.tentativaLogin.deleteMany({ where: { chave } });
  await audit(userId, "trocar a própria senha", "Usuario", userId);
  return { ok: true, sessaoVersao: salvo.sessaoVersao };
}
