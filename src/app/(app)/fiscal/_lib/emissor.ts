/**
 * Porta para o emissor de NF-e (API terceirizada que assina com o certificado A1 e fala com a SEFAZ). O resto do sistema só
 * conhece esta interface: trocar de emissor = escrever outra implementação, sem mexer em montagem, serviço nem telas.
 *
 * Qual implementação vale (obterEmissor):
 *   - NFE_PROVEDOR e NFE_TOKEN definidos no .env → emissor real, SEMPRE no ambiente de homologação (sem valor fiscal).
 *     Produção exige mudança de código revisada (docs/NFE.md §7), não só variável de ambiente.
 *   - senão → EmissorSimulado: valida e devolve chave fictícia (válida no formato, sem valor fiscal).
 */
import { randomInt } from "node:crypto";
import { empresa } from "@/lib/empresa";
import { onlyDigits } from "@/lib/documentos-br";
import { chaveValida, montarChave, r2, type Nfe } from "./nfe";

export type Ambiente = "SIMULADO" | "HOMOLOGACAO" | "PRODUCAO";

export type RetornoEmissor = {
  situacao: "AUTORIZADA" | "PROCESSANDO" | "REJEITADA" | "CANCELADA" | "NAO_ENCONTRADA";
  chave?: string;
  protocolo?: string;
  numero?: number;
  serie?: number;
  xmlUrl?: string | null;
  danfeUrl?: string | null;
  mensagem?: string;
};

export type RetornoEvento = { ok: boolean; protocolo?: string; sequencia?: number; mensagem?: string };

export interface Emissor {
  readonly provedor: string;
  readonly ambiente: Ambiente;
  /** Envia a nota com a referência (idempotente no emissor: a mesma referência não gera duas notas). */
  emitir(referencia: string, nfe: Nfe): Promise<RetornoEmissor>;
  consultar(referencia: string): Promise<RetornoEmissor>;
  cancelar(referencia: string, justificativa: string): Promise<RetornoEvento>;
  cartaCorrecao(referencia: string, texto: string): Promise<RetornoEvento>;
}

/** Erro de comunicação com o emissor (rede, 5xx, resposta inesperada): a nota fica ENVIADA e o usuário consulta depois. */
export class EmissorIndisponivel extends Error {}

/** Referência da nota no emissor: estável por tentativa ("nf12-1"). */
export const referenciaDaNota = (notaId: number, tentativa: number) => `nf${notaId}-${tentativa}`;

/** Conferência de consistência antes de mandar (a montagem já validou; aqui é a última barreira, igual para todo emissor). */
export function conferirAntesDeEnviar(nfe: Nfe): string[] {
  const erros: string[] = [];
  const soma = r2(nfe.itens.reduce((a, i) => a + i.valorTotal, 0));
  if (soma !== nfe.totais.produtos) erros.push("Soma dos itens diferente do total de produtos.");
  for (const c of nfe.chavesReferenciadas) if (!chaveValida(c)) erros.push(`Chave referenciada inválida: ${c}.`);
  for (const i of nfe.itens) if (!/^\d{8}$/.test(i.ncm)) erros.push(`Item ${i.numeroItem}: NCM inválido.`);
  if (nfe.itens.length === 0) erros.push("Nota sem itens.");
  return erros;
}

type EstadoSimulado = { retorno: RetornoEmissor; cartas: number };

/**
 * Emissor de mentira, para desenvolvimento, demonstração e testes. Regras de "SEFAZ" simuladas:
 *   - consistência (conferirAntesDeEnviar) e NCM 00000000 → REJEITADA (simula a rejeição 778, NCM inexistente);
 *   - `assincrono: true` → a primeira resposta é PROCESSANDO e a consulta seguinte autoriza (testa o caminho da consulta);
 *   - cancelamento só de autorizada; carta de correção até 20 por nota.
 * O estado fica em memória do processo (reiniciar o servidor "esquece" as notas simuladas em processamento).
 */
export class EmissorSimulado implements Emissor {
  readonly provedor = "SIMULADO";
  readonly ambiente: Ambiente = "SIMULADO";
  private static estado = new Map<string, EstadoSimulado>();
  constructor(private opcoes: { assincrono?: boolean } = {}) {}

  async emitir(referencia: string, nfe: Nfe): Promise<RetornoEmissor> {
    const anterior = EmissorSimulado.estado.get(referencia);
    if (anterior) return anterior.retorno; // mesma referência: devolve a mesma nota (idempotência)
    const erros = conferirAntesDeEnviar(nfe);
    if (nfe.itens.some((i) => i.ncm === "00000000")) erros.push("Rejeição 778: Informado NCM inexistente.");
    if (erros.length) {
      const r: RetornoEmissor = { situacao: "REJEITADA", mensagem: erros.join(" ") };
      EmissorSimulado.estado.set(referencia, { retorno: r, cartas: 0 });
      return r;
    }
    const numero = Number(referencia.match(/^nf(\d+)-/)?.[1] ?? randomInt(1, 999_999));
    const serie = 1;
    const chave = montarChave({ cUF: 35, emissao: new Date(), cnpj: onlyDigits(empresa().cnpj), serie, numero, codigo: randomInt(0, 99_999_999) });
    const autorizada: RetornoEmissor = {
      situacao: "AUTORIZADA",
      chave,
      protocolo: `9${String(Date.now()).slice(-14)}`,
      numero,
      serie,
      xmlUrl: null,
      danfeUrl: null,
      mensagem: "Autorizada (SIMULADO: sem valor fiscal)",
    };
    if (this.opcoes.assincrono) {
      EmissorSimulado.estado.set(referencia, { retorno: { situacao: "PROCESSANDO", mensagem: "Em processamento (simulado)" }, cartas: 0 });
      EmissorSimulado.pendentes.set(referencia, autorizada);
      return { situacao: "PROCESSANDO", mensagem: "Em processamento (simulado)" };
    }
    EmissorSimulado.estado.set(referencia, { retorno: autorizada, cartas: 0 });
    return autorizada;
  }

  private static pendentes = new Map<string, RetornoEmissor>();

  async consultar(referencia: string): Promise<RetornoEmissor> {
    const pend = EmissorSimulado.pendentes.get(referencia);
    if (pend) {
      EmissorSimulado.pendentes.delete(referencia);
      EmissorSimulado.estado.set(referencia, { retorno: pend, cartas: 0 });
      return pend;
    }
    return EmissorSimulado.estado.get(referencia)?.retorno ?? { situacao: "NAO_ENCONTRADA", mensagem: "Nota não encontrada no emissor simulado (o servidor pode ter reiniciado)." };
  }

  async cancelar(referencia: string, justificativa: string): Promise<RetornoEvento> {
    const e = EmissorSimulado.estado.get(referencia);
    if (!e || e.retorno.situacao !== "AUTORIZADA") return { ok: false, mensagem: "Só nota autorizada pode ser cancelada." };
    if (justificativa.trim().length < 15) return { ok: false, mensagem: "Justificativa com menos de 15 caracteres." };
    e.retorno = { ...e.retorno, situacao: "CANCELADA" };
    return { ok: true, protocolo: `9${String(Date.now()).slice(-14)}`, mensagem: "Cancelamento homologado (SIMULADO)" };
  }

  async cartaCorrecao(referencia: string, texto: string): Promise<RetornoEvento> {
    const e = EmissorSimulado.estado.get(referencia);
    if (!e || e.retorno.situacao !== "AUTORIZADA") return { ok: false, mensagem: "Carta de correção só para nota autorizada." };
    if (e.cartas >= 20) return { ok: false, mensagem: "Limite de 20 cartas de correção atingido." };
    e.cartas += 1;
    return { ok: true, sequencia: e.cartas, protocolo: `9${String(Date.now()).slice(-14)}`, mensagem: "Carta de correção registrada (SIMULADO)" };
  }
}

/** Escolhe o emissor pelas variáveis de ambiente (ver .env.example). Import dinâmico: o cliente HTTP só carrega se configurado. */
export async function obterEmissor(env: Record<string, string | undefined> = process.env): Promise<Emissor> {
  const provedor = env.NFE_PROVEDOR?.trim().toUpperCase();
  const token = env.NFE_TOKEN?.trim();
  if (!provedor || !token) return new EmissorSimulado();
  if (provedor === "FOCUS") {
    const { EmissorFocus } = await import("./emissor-focus");
    return new EmissorFocus(token, onlyDigits(empresa().cnpj));
  }
  throw new Error(`NFE_PROVEDOR desconhecido: ${provedor}. Valores aceitos: FOCUS (ou deixe vazio para o simulado).`);
}
