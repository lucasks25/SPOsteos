import { DICA_AUTH_SECRET, problemaAuthSecret } from "@/lib/auth-config";

/**
 * Roda uma vez na subida do servidor (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md); um erro aqui
 * impede o servidor de atender (conferido no código do Next 16.4: registerInstrumentation relança o erro).
 * Em produção, sem AUTH_SECRET forte o servidor não sobe: antes só falhava no primeiro login.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const problema = problemaAuthSecret(process.env.AUTH_SECRET);
  if (!problema) return;
  if (process.env.NODE_ENV === "production") throw new Error(`${problema} ${DICA_AUTH_SECRET}`);
  console.warn(`[segurança] ${problema} ${DICA_AUTH_SECRET}`);
}
