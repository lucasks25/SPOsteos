import { NextResponse, type NextRequest } from "next/server";

// Verificação otimista: sem cookie de sessão, manda para o login.
// A validação real (assinatura + perfil) acontece em requireUser().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("opme_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
