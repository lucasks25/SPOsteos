/**
 * Minimização na exibição (LGPD art. 6º III): listas, buscas e seletores mostram o paciente reduzido; o nome completo
 * fica na tela de detalhe e nos impressos obrigatórios (docs/LGPD.md §3). Funções puras, sem dependência de servidor.
 */

const PARTICULAS = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "DI", "DU", "DEL", "VAN", "VON"]);
const SUFIXOS = new Set(["JR", "JUNIOR", "FILHO", "FILHA", "NETO", "NETA", "SOBRINHO", "SOBRINHA", "SEGUNDO", "II", "III"]);
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\.$/, "");

/** "Maria da Silva Santos" → "Maria S."; "Pedro Souza Filho" → "Pedro S."; "Ana" → "Ana"; vazio → "". */
export function mascararNome(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeiro = partes[0];
  const resto = partes.slice(1).filter((p) => !PARTICULAS.has(semAcento(p)));
  while (resto.length && SUFIXOS.has(semAcento(resto[resto.length - 1]))) resto.pop();
  const ultimo = resto[resto.length - 1];
  return ultimo ? `${primeiro} ${ultimo.charAt(0).toLocaleUpperCase("pt-BR")}.` : primeiro;
}

/** Carteirinha só com os 4 últimos caracteres: "0123 4567 8901 2345" → "•••• 2345". Até 4 caracteres: "••••". */
export function mascararCarteirinha(valor: string | null | undefined): string {
  const v = (valor ?? "").replace(/[^0-9A-Za-z]/g, "");
  if (!v) return "";
  return v.length <= 4 ? "••••" : `•••• ${v.slice(-4)}`;
}
