import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/forms";
import { DICA_AUTH_SECRET, mfaObrigatoria, problemaAuthSecret } from "@/lib/auth-config";
import { MSG_BLOQUEADO, limparTentativas, reservarTentativa } from "@/lib/auth-login";
import { cifrar, decifrar } from "@/lib/cripto";
import {
  base32, chaveLegivel, conferirTotp, deBase32, novoSegredo, novosCodigosRecuperacao, pareceRecuperacao, resumoRecuperacao, uriOtpauth,
} from "@/lib/auth-totp";

/**
 * Estado do 2º fator (TOTP) no banco: segredo cifrado, data de ativação, último passo aceito (anti-replay) e resumos
 * dos códigos de recuperação. Cadastro em duas etapas: gerar a chave (fica pendente, mfaAtivadoEm nulo) e confirmar
 * com um código do aplicativo (prova que o celular ficou com a chave). Limite: 5 códigos errados a cada 15 min por
 * usuário (mesma janela do login), cada erro na auditoria.
 */
function segredoApp(): string {
  const s = process.env.AUTH_SECRET;
  const p = problemaAuthSecret(s);
  if (p) throw new Error(`${p} ${DICA_AUTH_SECRET}`);
  return s!;
}

/** Semente do TOTP cifrada com a DATA_KEY (AES-256-GCM, contexto como AAD: não pode ser copiada para outra coluna). */
const CONTEXTO = "Usuario.mfaSegredo";
const cifrarSegredo = (seg: Buffer) => cifrar(base32(seg), CONTEXTO);
function decifrarSegredo(valor: string): Buffer | null {
  try {
    return deBase32(decifrar(valor, CONTEXTO));
  } catch {
    return null; // chave errada, valor adulterado: trata como sem cadastro válido
  }
}

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

/** Gera (ou troca) a chave pendente. Não mexe num 2º fator já ativo. */
export async function iniciarCadastroMfa(userId: string): Promise<Resultado> {
  const n = await db.usuario.updateMany({ where: { id: userId, mfaAtivadoEm: null }, data: { mfaSegredo: cifrarSegredo(novoSegredo()), mfaUltimoPasso: null } });
  if (n.count === 0) return { ok: false, erro: "A verificação em duas etapas já está ativa." };
  await audit(userId, "gerar chave do 2º fator", "Usuario", userId);
  return { ok: true };
}

/** Chave pendente para mostrar na tela de cadastro (null se não houver). */
export async function cadastroPendente(userId: string): Promise<{ chave: string; uri: string } | null> {
  const u = await db.usuario.findUnique({ where: { id: userId }, select: { email: true, mfaSegredo: true, mfaAtivadoEm: true } });
  if (!u?.mfaSegredo || u.mfaAtivadoEm) return null;
  const seg = decifrarSegredo(u.mfaSegredo);
  return seg ? { chave: chaveLegivel(seg), uri: uriOtpauth(seg, u.email) } : null;
}

/**
 * Aceita o passo uma vez só: grava o passo se for maior que o último aceito. Atômico (um UPDATE condicional), então
 * dois pedidos simultâneos com o mesmo código não passam os dois.
 */
async function consumirPasso(userId: string, passo: number): Promise<boolean> {
  const n = await db.$executeRaw`UPDATE "Usuario" SET "mfaUltimoPasso" = ${passo} WHERE id = ${userId} AND ("mfaUltimoPasso" IS NULL OR "mfaUltimoPasso" < ${passo})`;
  return n === 1;
}

async function gravarCodigos(userId: string): Promise<string[]> {
  const codigos = novosCodigosRecuperacao();
  const app = segredoApp();
  await db.usuario.update({ where: { id: userId }, data: { mfaRecuperacao: codigos.map((c) => resumoRecuperacao(c, app)) } });
  return codigos;
}

/** Confirma o cadastro com um código do aplicativo. Devolve os códigos de recuperação (mostrados uma única vez). */
export async function confirmarCadastroMfa(userId: string, codigo: string): Promise<Resultado<{ codigos: string[]; sessaoVersao: number }>> {
  const chaveLimite = `mfa:${userId}`;
  if (!(await reservarTentativa(chaveLimite))) return { ok: false, erro: MSG_BLOQUEADO };
  const u = await db.usuario.findUnique({ where: { id: userId }, select: { mfaSegredo: true, mfaAtivadoEm: true } });
  if (u?.mfaAtivadoEm) return { ok: false, erro: "A verificação em duas etapas já está ativa." };
  const seg = u?.mfaSegredo ? decifrarSegredo(u.mfaSegredo) : null;
  if (!seg) return { ok: false, erro: "Gere a chave de novo e cadastre no aplicativo." };
  const passo = conferirTotp(seg, codigo);
  if (passo === null || !(await consumirPasso(userId, passo))) {
    await audit(userId, "ativar 2º fator falhou", "Usuario", userId, "código incorreto");
    return { ok: false, erro: "Código incorreto. Confira a hora do celular e digite o código atual do aplicativo." };
  }
  // sobe a versão: sessões abertas antes (sem 2º fator) caem; o chamador recria a deste aparelho
  const salvo = await db.usuario.update({ where: { id: userId }, data: { mfaAtivadoEm: new Date(), sessaoVersao: { increment: 1 } }, select: { sessaoVersao: true } });
  const codigos = await gravarCodigos(userId);
  await limparTentativas(chaveLimite);
  await audit(userId, "ativar 2º fator", "Usuario", userId, `${codigos.length} códigos de recuperação gerados`);
  return { ok: true, codigos, sessaoVersao: salvo.sessaoVersao };
}

/**
 * Confere o 2º fator de quem já tem cadastro: código de 6 dígitos do aplicativo ou um código de recuperação (que é
 * gasto: removido do banco no mesmo UPDATE que o confere).
 */
export async function verificarSegundoFator(userId: string, codigo: string, motivo: string): Promise<Resultado<{ recuperacao: boolean; restantes: number }>> {
  const chaveLimite = `mfa:${userId}`;
  if (!(await reservarTentativa(chaveLimite))) return { ok: false, erro: MSG_BLOQUEADO };
  const u = await db.usuario.findUnique({ where: { id: userId }, select: { mfaSegredo: true, mfaAtivadoEm: true, mfaRecuperacao: true } });
  if (!u?.mfaAtivadoEm || !u.mfaSegredo) return { ok: false, erro: "Verificação em duas etapas não está ativa." };
  const app = segredoApp();
  let ok = false;
  let recuperacao = false;
  if (pareceRecuperacao(codigo)) {
    const h = resumoRecuperacao(codigo, app);
    const n = await db.$executeRaw`UPDATE "Usuario" SET "mfaRecuperacao" = array_remove("mfaRecuperacao", ${h}) WHERE id = ${userId} AND ${h} = ANY("mfaRecuperacao")`;
    ok = recuperacao = n === 1;
  } else {
    const seg = decifrarSegredo(u.mfaSegredo);
    const passo = seg ? conferirTotp(seg, codigo) : null;
    ok = passo !== null && (await consumirPasso(userId, passo));
  }
  if (!ok) {
    await audit(userId, "2º fator falhou", "Usuario", userId, motivo);
    return { ok: false, erro: "Código incorreto." };
  }
  await limparTentativas(chaveLimite);
  const restantes = u.mfaRecuperacao.length - (recuperacao ? 1 : 0);
  return { ok: true, recuperacao, restantes };
}

/** Novos códigos de recuperação (os antigos deixam de valer). Exige um código válido. */
export async function regenerarCodigos(userId: string, codigo: string): Promise<Resultado<{ codigos: string[] }>> {
  const v = await verificarSegundoFator(userId, codigo, "gerar novos códigos de recuperação");
  if (!v.ok) return v;
  const codigos = await gravarCodigos(userId);
  await audit(userId, "gerar códigos de recuperação", "Usuario", userId, `${codigos.length} códigos; os anteriores foram invalidados`);
  return { ok: true, codigos };
}

const DESLIGADO = { mfaSegredo: null, mfaAtivadoEm: null, mfaUltimoPasso: null, mfaRecuperacao: [] };

/** Desliga o próprio 2º fator (só para perfil em que ele não é obrigatório). Exige um código válido. */
export async function desativarMfa(userId: string, perfil: string, codigo: string): Promise<Resultado> {
  if (mfaObrigatoria(perfil)) return { ok: false, erro: "Para o seu perfil a verificação em duas etapas é obrigatória." };
  const v = await verificarSegundoFator(userId, codigo, "desativar 2º fator");
  if (!v.ok) return v;
  await db.usuario.update({ where: { id: userId }, data: DESLIGADO });
  await audit(userId, "desativar 2º fator", "Usuario", userId);
  return { ok: true };
}

/** Admin zera o 2º fator de outra pessoa (celular perdido sem códigos): ela cadastra de novo no próximo acesso. */
export async function zerarMfaDeOutro(adminId: string, userId: string): Promise<Resultado<{ email: string }>> {
  if (adminId === userId) return { ok: false, erro: "Para a sua própria conta, use Minha conta → Segurança (exige o código)." };
  const u = await db.usuario.update({ where: { id: userId }, data: { ...DESLIGADO, sessaoVersao: { increment: 1 } }, select: { email: true } });
  return { ok: true, email: u.email };
}
