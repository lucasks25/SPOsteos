import { DICA_AUTH_SECRET, problemaAuthSecret } from "@/lib/auth-config";
import { problemasInfra } from "@/lib/infra-config";
import { DICA_DATA_KEY, problemaDataKey } from "@/lib/cripto-config";

/**
 * Roda uma vez na subida do servidor (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md); um erro aqui
 * impede o servidor de atender (conferido no código do Next 16.4: registerInstrumentation relança o erro).
 * Em produção, configuração insegura derruba a subida (antes só falhava no primeiro login ou, pior, funcionava):
 * AUTH_SECRET fraco, DATABASE_URL sem TLS ou com senha de exemplo (opme:opme), TRUST_PROXY inválido.
 * Fora de produção só avisa. Para somar outra checagem (ex.: DATA_KEY), acrescente a mensagem em `problemas`.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const problemas: string[] = [];
  const authSecret = problemaAuthSecret(process.env.AUTH_SECRET);
  if (authSecret) problemas.push(`${authSecret} ${DICA_AUTH_SECRET}`);
  problemas.push(...problemasInfra(process.env));
  // chave da cifra dos dados sensíveis (carteirinha do paciente; docs/LGPD.md §4): sem ela não há como gravar nem ler
  const dataKey = problemaDataKey(process.env.DATA_KEY);
  if (dataKey) problemas.push(`${dataKey} ${DICA_DATA_KEY}`);
  if (problemas.length === 0) return;
  if (process.env.NODE_ENV === "production") throw new Error(`Configuração insegura, o servidor não sobe: ${problemas.join(" | ")}`);
  for (const p of problemas) console.warn(`[segurança] ${p}`);
}
