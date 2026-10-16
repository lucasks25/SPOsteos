/**
 * Validação da configuração de infraestrutura (banco, proxy). Funções puras e sem "server-only": usadas pelo
 * src/instrumentation.ts (que recusa subir em produção com configuração insegura) e pelos testes.
 */

/** Máximo de proxies confiáveis à frente do app (CDN + balanceador + nginx raramente passam de 3). */
export const TRUST_PROXY_MAX = 5;

/**
 * TRUST_PROXY = quantos proxies confiáveis (que acrescentam o IP de quem os chamou ao x-forwarded-for) ficam à frente do app.
 * Ausente ou "0" = nenhum (x-forwarded-for é ignorado). "1" = um proxy (caso comum: nginx/Caddy). Devolve null se inválido.
 */
export function saltosProxyConfiavel(valor: string | undefined): number | null {
  const v = (valor ?? "").trim();
  if (v === "") return 0;
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n <= TRUST_PROXY_MAX ? n : null;
}

const SENHAS_FRACAS = new Set(["opme", "postgres", "password", "senha", "admin", "123456", "12345678", "changeme", "troque"]);
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Problemas da DATABASE_URL para produção (lista vazia = ok). Nunca devolve a senha na mensagem. */
export function problemasDatabaseUrl(url: string | undefined, permitirSemTls = false): string[] {
  if (!url) return []; // ausente: o cliente do banco já falha com mensagem própria
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return ["DATABASE_URL não é uma URL válida."];
  }
  const problemas: string[] = [];
  const usuario = decodeURIComponent(u.username);
  const senha = decodeURIComponent(u.password);
  if (!senha) problemas.push("DATABASE_URL sem senha.");
  else if (senha === usuario || SENHAS_FRACAS.has(senha.toLowerCase())) {
    problemas.push("DATABASE_URL usa senha de exemplo/fraca (ex.: opme:opme); defina uma senha aleatória.");
  }
  const sslmode = (u.searchParams.get("sslmode") ?? "").toLowerCase();
  const tlsOk = ["require", "verify-ca", "verify-full"].includes(sslmode) || u.searchParams.get("ssl") === "true";
  if (!tlsOk && !permitirSemTls && !HOSTS_LOCAIS.has(u.hostname.toLowerCase())) {
    problemas.push("DATABASE_URL sem TLS: acrescente sslmode=verify-full (ou require) à conexão com o banco.");
  }
  return problemas;
}

/** Todos os problemas de infraestrutura do ambiente (usado na subida em produção). */
export function problemasInfra(env: Record<string, string | undefined>): string[] {
  const problemas = problemasDatabaseUrl(env.DATABASE_URL, env.ALLOW_INSECURE_DB === "1");
  if (saltosProxyConfiavel(env.TRUST_PROXY) === null) {
    problemas.push(`TRUST_PROXY inválido: use 0 (sem proxy) ou o número de proxies confiáveis (1 a ${TRUST_PROXY_MAX}).`);
  }
  return problemas;
}
