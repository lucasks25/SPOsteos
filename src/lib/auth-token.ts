import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { DICA_AUTH_SECRET, problemaAuthSecret } from "@/lib/auth-config";

/**
 * Assinatura e conferência dos tokens (cookie de sessão e cookie da 2ª etapa do login). Separado de src/lib/auth.ts
 * (que usa next/navigation) para ser testado sem o Next: tests/seguranca/auth-sessao.test.ts.
 */
function secretKey() {
  const secret = process.env.AUTH_SECRET;
  const problema = problemaAuthSecret(secret); // também conferido na subida do servidor (src/instrumentation.ts)
  if (problema) throw new Error(`${problema} ${DICA_AUTH_SECRET}`);
  return new TextEncoder().encode(secret);
}

export type Finalidade = "sessao" | "mfa";

export function assinarToken(userId: string, versao: number, expires: Date, finalidade: Finalidade): Promise<string> {
  return new SignJWT({ sub: userId, v: versao, ...(finalidade === "mfa" ? { f: "mfa" } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secretKey());
}

/**
 * Confere assinatura (só HS256: `alg: none` e troca de algoritmo são recusados pelo jose), validade e finalidade.
 * O token da etapa do 2º fator (`f: "mfa"`) não serve como sessão, e vice-versa.
 */
export async function verifyToken(token: string | undefined, finalidade: Finalidade = "sessao") {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if ((payload.f === "mfa") !== (finalidade === "mfa")) return null;
    return typeof payload.sub === "string" ? { id: payload.sub, versao: typeof payload.v === "number" ? payload.v : -1 } : null;
  } catch {
    return null;
  }
}
