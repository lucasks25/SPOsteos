/**
 * Nome e atributos do cookie de sessão. Sem "server-only" para o src/proxy.ts (verificação otimista) usar o mesmo nome.
 *
 * Em produção (cookie Secure) o nome leva o prefixo `__Host-`: o navegador só aceita esse cookie se vier com Secure,
 * Path=/ e SEM Domain, então um subdomínio vizinho (ex.: outro sistema em *.empresa.com.br) não consegue plantar nem
 * sobrescrever a sessão (RFC 6265bis §4.1.3.2). Em desenvolvimento (http) o prefixo não é usado, porque exige Secure.
 */
export function cookieSeguro(): boolean {
  return process.env.NODE_ENV === "production";
}

export function nomeCookieSessao(): string {
  return cookieSeguro() ? "__Host-opme_session" : "opme_session";
}

/** Cookie curto do 2º fator: senha conferida, falta o código do aplicativo autenticador. */
export function nomeCookieMfa(): string {
  return cookieSeguro() ? "__Host-opme_mfa" : "opme_mfa";
}
