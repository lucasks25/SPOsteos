import type { Perfil } from "@/generated/prisma/client";

/**
 * Regras PURAS do recolhimento de lote / tecnovigilância (sem banco, testáveis).
 * O que mexe no banco fica em recolhimento-servico.ts.
 */

export const docRecolhimento = (id: number) => `REC-${id}`;

export const ORIGENS = ["ANVISA", "FABRICANTE", "INTERNO"] as const;
export const CLASSES = ["I", "II", "III"] as const;
export const ROTULO_ORIGEM: Record<(typeof ORIGENS)[number], string> = { ANVISA: "Alerta da ANVISA", FABRICANTE: "Fabricante", INTERNO: "Qualidade interna" };
export const ROTULO_CLASSE: Record<(typeof CLASSES)[number], string> = { I: "Classe I (maior risco)", II: "Classe II", III: "Classe III (menor risco)" };

/** Abrir, comunicar, justificar, concluir e cancelar. */
export const PERFIS_OPERAR_RECOLHIMENTO: Perfil[] = ["QUALIDADE"];
/** Recolhimento físico (move estoque): Qualidade e Estoque. */
export const PERFIS_RECOLHER: Perfil[] = ["QUALIDADE", "ESTOQUE"];
/** Consulta: quem opera mais o Comercial (que não vê paciente). */
export const PERFIS_VER_RECOLHIMENTO: Perfil[] = ["QUALIDADE", "ESTOQUE", "COMERCIAL"];

const com = (p: Perfil, lista: Perfil[]) => p === "ADMIN" || lista.includes(p);
export const podeOperarRecolhimento = (p: Perfil) => com(p, PERFIS_OPERAR_RECOLHIMENTO);
export const podeRecolherFisico = (p: Perfil) => com(p, PERFIS_RECOLHER);
/** Dado de paciente é sensível (LGPD): só Qualidade e Admin. */
export const podeVerPacientes = (p: Perfil) => p === "ADMIN" || p === "QUALIDADE";

export type StatusRecolhimento = "ABERTO" | "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";
export type StatusAlvo = "PENDENTE" | "COMUNICADO" | "RECOLHIDO" | "SEM_SALDO";

export const encerrado = (s: string) => s === "CONCLUIDO" || s === "CANCELADO";

export type AlvoCalc = {
  status: StatusAlvo;
  saldoAbertura: number;
  quantidadeRecolhida: number;
  saldoAtual: number;
  justificativa?: string | null;
};

/** Unidades que ainda faltam recolher neste alvo: o saldo atual, exceto se houver justificativa. */
export function aRecolher(a: Pick<AlvoCalc, "saldoAtual" | "justificativa">): number {
  if (a.justificativa && a.justificativa.trim()) return 0;
  return Math.max(0, a.saldoAtual);
}

/** Situação mostrada: o saldo mudou desde a abertura? */
export function saldoMudou(a: Pick<AlvoCalc, "saldoAbertura" | "quantidadeRecolhida" | "saldoAtual">): boolean {
  return a.saldoAtual + a.quantidadeRecolhida !== a.saldoAbertura;
}

/** Valida a quantidade a recolher: inteiro positivo e no máximo o saldo atual. Devolve a mensagem ou null. */
export function validarRecolhimento(quantidade: number, saldoAtual: number): string | null {
  if (!Number.isInteger(quantidade) || quantidade <= 0) return "Informe uma quantidade inteira maior que zero.";
  if (saldoAtual <= 0) return "Este local não tem mais saldo do lote.";
  if (quantidade > saldoAtual) return `Não é possível recolher ${quantidade}: o saldo atual neste local é ${saldoAtual}.`;
  return null;
}

/** Status do alvo depois de uma baixa física. */
export function statusAposRecolher(saldoRestante: number, atual: StatusAlvo): StatusAlvo {
  return saldoRestante <= 0 ? "RECOLHIDO" : atual === "RECOLHIDO" ? "COMUNICADO" : atual;
}

/** O que impede a conclusão (lista vazia = pode concluir). */
export function pendenciasParaConcluir(alvos: (AlvoCalc & { rotulo: string })[]): string[] {
  const out: string[] = [];
  for (const a of alvos) {
    const falta = aRecolher(a);
    if (falta > 0) out.push(`${a.rotulo}: ${falta} un. no local sem recolhimento nem justificativa.`);
  }
  return out;
}

/** Prazo vencido: tem prazo, ainda não encerrou e o prazo é anterior a hoje. */
export function prazoVencido(prazo: Date | null, status: string, hoje: Date): boolean {
  return !!prazo && !encerrado(status) && prazo.getTime() < hoje.getTime();
}

export type ResumoRecolhimento = {
  encontrado: number; // unidades na abertura (soma das fotos)
  recolhido: number;
  aRecolher: number; // saldo que ainda está nos locais (sem justificativa)
  justificado: number;
  alvos: number;
  alvosPendentes: number; // alvos que ainda têm unidades a recolher
  pacientes: number;
  pacientesComunicados: number;
  pacientesAComunicar: number;
};

export function resumirRecolhimento(alvos: AlvoCalc[], pacientes: { comunicadoEm: Date | null }[]): ResumoRecolhimento {
  const r: ResumoRecolhimento = { encontrado: 0, recolhido: 0, aRecolher: 0, justificado: 0, alvos: alvos.length, alvosPendentes: 0, pacientes: pacientes.length, pacientesComunicados: 0, pacientesAComunicar: 0 };
  for (const a of alvos) {
    r.encontrado += a.saldoAbertura;
    r.recolhido += a.quantidadeRecolhida;
    const falta = aRecolher(a);
    r.aRecolher += falta;
    if (falta > 0) r.alvosPendentes++;
    else if (a.saldoAtual > 0) r.justificado += a.saldoAtual;
  }
  r.pacientesComunicados = pacientes.filter((p) => p.comunicadoEm).length;
  r.pacientesAComunicar = r.pacientes - r.pacientesComunicados;
  return r;
}

/** Tipo de movimento do recolhimento físico: do hospital é RETORNO; de depósito/quarentena é TRANSFERENCIA. */
export function tipoMovimentoRecolhimento(tipoLocal: string): "RETORNO" | "TRANSFERENCIA" {
  return tipoLocal === "HOSPITAL" ? "RETORNO" : "TRANSFERENCIA";
}

/** Status que o lote assume ao abrir: já BLOQUEADO continua (e o cancelamento não o desbloqueia). */
export function planoBloqueio(statusLote: string): { bloquear: boolean; bloqueadoPorEste: boolean } {
  return statusLote === "BLOQUEADO" ? { bloquear: false, bloqueadoPorEste: false } : { bloquear: true, bloqueadoPorEste: true };
}
