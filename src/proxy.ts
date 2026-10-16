import { NextResponse, type NextRequest } from "next/server";
import { nomeCookieSessao } from "@/lib/auth-cookie";

/**
 * 1) Verificação otimista: sem cookie de sessão, manda para o login (a validação real é em requireUser()).
 * 2) Content-Security-Policy com nonce por requisição (guia: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 *    Scripts só com o nonce; estilos aceitam inline porque o React usa atributos style.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/login" && !request.cookies.has(nomeCookieSessao())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", // data: só para a seta do <select> (src/app/estilos/base.css); blob: não é usado
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // /marca/* (logotipos públicos, usados no login) e o ícone do app ficam fora da verificação de sessão
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon.png|marca/).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
