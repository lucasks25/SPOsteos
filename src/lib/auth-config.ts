/**
 * Validação do AUTH_SECRET (chave que assina o cookie de sessão). Sem "server-only" para ser usada também no
 * src/instrumentation.ts, que derruba a subida do servidor de produção se a chave faltar (docs/REVISAO.md §19, S5).
 * Devolve a mensagem de erro, ou null se a chave serve.
 */
export function problemaAuthSecret(secret: string | undefined): string | null {
  if (!secret) return "AUTH_SECRET ausente.";
  if (secret.length < 32) return "AUTH_SECRET curto (mínimo 32 caracteres).";
  // o valor do .env.example é público: nunca pode valer
  if (/troque|exemplo|changeme|secret/i.test(secret)) return "AUTH_SECRET é um valor de exemplo.";
  if (new Set(secret).size < 8) return "AUTH_SECRET sem variedade (use um valor aleatório).";
  return null;
}

export const DICA_AUTH_SECRET = "Gere um com: openssl rand -hex 32";
