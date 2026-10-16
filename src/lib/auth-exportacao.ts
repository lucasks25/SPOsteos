import "server-only";
import { audit } from "@/lib/forms";
import { respostaCsv } from "@/lib/csv";

/**
 * Download de CSV com rastro: quem exportou, qual relatório, quantas linhas e com que filtros (vazamento interno por
 * exportação em massa é o caso típico de incidente da LGPD; a auditoria responde "quem levou o quê e quando").
 * Toda rota que devolve CSV passa por aqui (tests/seguranca/acesso-exportacao.test.ts confere).
 */
export async function exportarCsv(user: { id: string }, req: Request, nome: string, linhas: (string | number)[][]): Promise<Response> {
  const url = new URL(req.url);
  const filtros = [...url.searchParams.entries()].map(([k, v]) => `${k}=${v.slice(0, 60)}`).join("&") || "nenhum";
  // a 1ª linha é o cabeçalho
  await audit(user.id, "exportar CSV", "Relatorio", url.pathname.slice(0, 120), `${nome}: ${Math.max(linhas.length - 1, 0)} linha(s); filtros: ${filtros}`.slice(0, 900));
  return respostaCsv(nome, linhas);
}
