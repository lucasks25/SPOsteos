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

/**
 * Perfis que movem dinheiro ou dados bancários (e o admin, que dá acesso a tudo) precisam do 2º fator (TOTP).
 * Obrigatório em produção; em desenvolvimento só com MFA_OBRIGATORIA=1 (para não travar quem testa com o seed).
 * MFA_OBRIGATORIA=0 desliga em produção: só para emergência, e fica registrado na configuração do servidor.
 */
export const PERFIS_MFA_OBRIGATORIA: readonly string[] = ["ADMIN", "FINANCEIRO"];

export function mfaObrigatoria(perfil: string, env: Record<string, string | undefined> = process.env): boolean {
  if (!PERFIS_MFA_OBRIGATORIA.includes(perfil)) return false;
  if (env.MFA_OBRIGATORIA === "1") return true;
  return env.NODE_ENV === "production" && env.MFA_OBRIGATORIA !== "0";
}
