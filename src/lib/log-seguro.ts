/**
 * Resumo de um erro para o log do servidor, SEM dados pessoais. O erro do Prisma carrega nas mensagens os argumentos da
 * consulta (nome do paciente, carteirinha, valores...), e `console.error(e)` imprimia tudo isso nos logs (LGPD).
 * Aqui ficam só: tipo, código (Prisma/Postgres/Node), campos de meta.target/column e as linhas da pilha (arquivos e
 * funções, sem a mensagem). Para erros comuns, a mensagem entra truncada e sem aspas com conteúdo.
 */
export function resumoErroParaLog(e: unknown): string {
  if (!(e instanceof Error)) return `valor lançado do tipo ${typeof e}`;
  const x = e as Error & { code?: unknown; meta?: { target?: unknown; column?: unknown; modelName?: unknown } };
  const partes = [e.name];
  if (typeof x.code === "string") partes.push(`code=${x.code}`);
  const alvo = x.meta?.target ?? x.meta?.column ?? x.meta?.modelName;
  if (alvo !== undefined) partes.push(`alvo=${Array.isArray(alvo) ? alvo.join(",") : String(alvo)}`);
  const prisma = /^PrismaClient/.test(e.name) || /^Prisma/.test(e.constructor?.name ?? "") || /prisma\./i.test(e.message.slice(0, 120));
  if (!prisma) partes.push(`msg=${e.message.replace(/["'`][^"'`]{0,200}["'`]/g, '"…"').replace(/\s+/g, " ").slice(0, 200)}`);
  const pilha = (e.stack ?? "").split("\n").filter((l) => /^\s+at /.test(l)).slice(0, 6).join(" | ");
  return `${partes.join(" ")}${pilha ? ` :: ${pilha}` : ""}`;
}
