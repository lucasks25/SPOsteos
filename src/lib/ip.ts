import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { saltosProxyConfiavel } from "@/lib/infra-config";

/**
 * IP do cliente a partir do x-forwarded-for, só quando TRUST_PROXY diz que há proxy confiável à frente do app.
 * Com N proxies confiáveis, o IP real é a N-ésima entrada contada do FIM da lista (cada proxy acrescenta ao fim o IP
 * de quem o chamou); entradas à esquerda podem ter sido forjadas pelo cliente. Sem TRUST_PROXY (ou inválido) devolve
 * null: o cabeçalho é ignorado e só vale o limite por e-mail. Único lugar do sistema que lê x-forwarded-for.
 */
export function ipDoCliente(xForwardedFor: string | null | undefined, trustProxy = process.env.TRUST_PROXY): string | null {
  const saltos = saltosProxyConfiavel(trustProxy);
  if (!saltos || !xForwardedFor) return null;
  const partes = xForwardedFor.split(",").map((p) => p.trim());
  if (partes.length < saltos) return null; // menos entradas que proxies: cabeçalho suspeito
  const ip = partes[partes.length - saltos];
  return isIP(ip) ? ip : null;
}

/** IP do cliente da requisição atual (Server Action ou rota). Null quando não há IP confiável. */
export async function ipDaRequisicao(): Promise<string | null> {
  return ipDoCliente((await headers()).get("x-forwarded-for"));
}
