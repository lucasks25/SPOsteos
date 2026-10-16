import "server-only";
import { NextResponse } from "next/server";
import { criarLimitador } from "@/lib/busca-util";

/**
 * Limite de requisições por usuário nas rotas pesadas (exportações CSV, downloads de arquivo, pendências), contra abuso
 * e sessão roubada raspando dados. Em memória, por processo: com mais de uma instância o limite efetivo é N vezes maior
 * (documentado em docs/PRODUCAO-SEGURA.md; um limite exato exigiria tabela/Redis). Os limitadores ficam em globalThis
 * porque o Next empacota cada rota separadamente e cada pacote teria o seu próprio Map.
 */
type Nome = "exportacao" | "download" | "pendencias";
const CONFIG: Record<Nome, [max: number, janelaMs: number]> = {
  exportacao: [10, 60_000], // CSV roda consulta grande: 10 por minuto
  download: [60, 60_000],
  pendencias: [60, 60_000], // o sino consulta a cada poucos segundos
};

const g = globalThis as unknown as { __opmeLimitadores?: Partial<Record<Nome, ReturnType<typeof criarLimitador>>> };

/** Devolve a resposta 429 quando o usuário passou do limite; null quando pode seguir. */
export function limitarRota(nome: Nome, userId: string): Response | null {
  const todos = (g.__opmeLimitadores ??= {});
  const permitir = (todos[nome] ??= criarLimitador(...CONFIG[nome]));
  if (permitir(`${nome}:${userId}`)) return null;
  return NextResponse.json({ erro: "Muitas requisições seguidas. Aguarde um minuto." }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
}
