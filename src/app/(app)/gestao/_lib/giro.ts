/** Giro e cobertura de estoque. Puro, testado em tests/gestao/giro.test.ts. */
export const DIAS_CONSUMO = 90;
export const DIAS_EXCESSO = 180;
export const DIAS_SEM_MOVIMENTO = 180;
export const PRAZO_REPOSICAO_PADRAO = 30;

export type EntradaGiro = {
  id: string;
  codigo: string;
  nome: string;
  estoqueMinimo: number;
  custoMedio: number;
  deposito: number;
  consignado: number;
  quarentena: number;
  naoConforme: number;
  /** soma dos movimentos de CONSUMO nos últimos DIAS_CONSUMO dias */
  consumo: number;
  /** data (instante) do último CONSUMO de todos os tempos, ou null */
  ultimoConsumo: Date | null;
};

export type SituacaoGiro = "RUPTURA" | "EXCESSO" | "SEM_MOVIMENTO" | "OK";

export type LinhaGiro = EntradaGiro & {
  /** deposito + consignado: o que está à venda (quarentena e não conforme não cobrem pedido) */
  disponivel: number;
  total: number;
  valor: number;
  consumoDia: number;
  /** dias de cobertura; null = sem consumo (infinita) */
  cobertura: number | null;
  /** giro anualizado = consumo anualizado / disponível; null se disponível = 0 */
  giro: number | null;
  diasSemMovimento: number | null;
  situacao: SituacaoGiro;
};

const cent = (n: number) => Math.round(n * 100);
const DIA = 24 * 60 * 60 * 1000;

/**
 * Cobertura = disponível / (consumo ÷ 90). Sem consumo não há divisão: cobertura null.
 * Giro anualizado = (consumo × 365/90) / disponível; disponível 0 → null; consumo 0 → 0.
 * Situação (nesta prioridade): RUPTURA = consumo>0 e disponível 0, ou disponível abaixo do mínimo (>0), ou cobertura < prazo de reposição;
 * SEM_MOVIMENTO = tem estoque e nenhum consumo há 180+ dias (ou nunca); EXCESSO = cobertura > 180 dias; senão OK.
 * `hoje` = instante atual (a idade usa dias inteiros corridos).
 */
export function calcularGiro(e: EntradaGiro, agora: Date, prazoReposicao = PRAZO_REPOSICAO_PADRAO): LinhaGiro {
  const disponivel = e.deposito + e.consignado;
  const total = disponivel + e.quarentena + e.naoConforme;
  const consumoDia = e.consumo / DIAS_CONSUMO;
  const cobertura = e.consumo > 0 ? Math.round((disponivel / consumoDia) * 10) / 10 : null;
  const giro = disponivel > 0 ? Math.round(((e.consumo * 365) / DIAS_CONSUMO / disponivel) * 100) / 100 : null;
  const diasSemMovimento = e.ultimoConsumo ? Math.max(0, Math.floor((agora.getTime() - e.ultimoConsumo.getTime()) / DIA)) : null;
  let situacao: SituacaoGiro = "OK";
  const abaixoMinimo = e.estoqueMinimo > 0 && disponivel < e.estoqueMinimo;
  if ((e.consumo > 0 && disponivel <= 0) || abaixoMinimo || (cobertura !== null && cobertura < prazoReposicao)) situacao = "RUPTURA";
  else if (disponivel > 0 && (diasSemMovimento === null || diasSemMovimento >= DIAS_SEM_MOVIMENTO)) situacao = "SEM_MOVIMENTO";
  else if (cobertura !== null && cobertura > DIAS_EXCESSO) situacao = "EXCESSO";
  return { ...e, disponivel, total, valor: cent(total * e.custoMedio) / 100, consumoDia: Math.round(consumoDia * 100) / 100, cobertura, giro, diasSemMovimento, situacao };
}

export const ROTULO_SITUACAO: Record<SituacaoGiro, string> = { RUPTURA: "Ruptura", EXCESSO: "Excesso", SEM_MOVIMENTO: "Sem movimento", OK: "Normal" };
