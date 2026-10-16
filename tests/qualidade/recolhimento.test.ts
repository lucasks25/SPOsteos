/** Regras puras do recolhimento de lote. Valores conferidos à mão. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aRecolher,
  docRecolhimento,
  pendenciasParaConcluir,
  planoBloqueio,
  podeOperarRecolhimento,
  podeRecolherFisico,
  podeVerPacientes,
  prazoVencido,
  resumirRecolhimento,
  saldoMudou,
  statusAposRecolher,
  tipoMovimentoRecolhimento,
  validarRecolhimento,
} from "@/app/(app)/qualidade/_lib/recolhimento";

const alvo = (o: Partial<Parameters<typeof aRecolher>[0]> & { saldoAbertura?: number; quantidadeRecolhida?: number; status?: "PENDENTE" | "COMUNICADO" | "RECOLHIDO" | "SEM_SALDO" }) => ({
  status: "PENDENTE" as const, saldoAbertura: 10, quantidadeRecolhida: 0, saldoAtual: 10, justificativa: null, ...o,
});

test("número do documento e validação da quantidade a recolher", () => {
  assert.equal(docRecolhimento(7), "REC-7");
  assert.equal(validarRecolhimento(3, 10), null);
  assert.equal(validarRecolhimento(10, 10), null);
  assert.match(validarRecolhimento(11, 10)!, /saldo atual neste local é 10/);
  assert.match(validarRecolhimento(0, 10)!, /maior que zero/);
  assert.match(validarRecolhimento(1.5, 10)!, /inteira/);
  assert.match(validarRecolhimento(-2, 10)!, /maior que zero/);
  assert.match(validarRecolhimento(1, 0)!, /não tem mais saldo/);
});

test("a recolher = saldo atual, exceto com justificativa; saldo mudou considera o já recolhido", () => {
  assert.equal(aRecolher({ saldoAtual: 6, justificativa: null }), 6);
  assert.equal(aRecolher({ saldoAtual: 6, justificativa: "devolvido ao fabricante" }), 0);
  assert.equal(aRecolher({ saldoAtual: 6, justificativa: "   " }), 6);
  assert.equal(aRecolher({ saldoAtual: -1, justificativa: null }), 0);
  assert.equal(saldoMudou({ saldoAbertura: 10, quantidadeRecolhida: 4, saldoAtual: 6 }), false);
  assert.equal(saldoMudou({ saldoAbertura: 10, quantidadeRecolhida: 4, saldoAtual: 5 }), true);
  assert.equal(saldoMudou({ saldoAbertura: 10, quantidadeRecolhida: 0, saldoAtual: 12 }), true);
});

test("status após recolher: zera = RECOLHIDO; parcial mantém", () => {
  assert.equal(statusAposRecolher(0, "COMUNICADO"), "RECOLHIDO");
  assert.equal(statusAposRecolher(3, "PENDENTE"), "PENDENTE");
  assert.equal(statusAposRecolher(3, "COMUNICADO"), "COMUNICADO");
  assert.equal(statusAposRecolher(3, "RECOLHIDO"), "COMUNICADO");
});

test("pendências para concluir listam só alvos com saldo e sem justificativa", () => {
  const ok = pendenciasParaConcluir([
    { ...alvo({ saldoAtual: 0, quantidadeRecolhida: 10 }), rotulo: "A" },
    { ...alvo({ saldoAtual: 4, justificativa: "devolvido ao fabricante" }), rotulo: "B" },
  ]);
  assert.deepEqual(ok, []);
  const falta = pendenciasParaConcluir([{ ...alvo({ saldoAtual: 4 }), rotulo: "Hospital X, lote L1" }]);
  assert.equal(falta.length, 1);
  assert.match(falta[0], /Hospital X, lote L1: 4 un\./);
});

test("resumo: encontrado 10+6, recolhido 4, a recolher 8, justificado 4, pacientes 3 com 1 comunicado", () => {
  const r = resumirRecolhimento(
    [
      alvo({ saldoAbertura: 10, quantidadeRecolhida: 4, saldoAtual: 6 }), // 6 a recolher
      alvo({ saldoAbertura: 6, quantidadeRecolhida: 0, saldoAtual: 4, justificativa: "consumido e devolvido" }), // justificado
      alvo({ saldoAbertura: 0, quantidadeRecolhida: 0, saldoAtual: 2 }), // apareceu depois
    ],
    [{ comunicadoEm: new Date() }, { comunicadoEm: null }, { comunicadoEm: null }],
  );
  assert.deepEqual(r, { encontrado: 16, recolhido: 4, aRecolher: 8, justificado: 4, alvos: 3, alvosPendentes: 2, pacientes: 3, pacientesComunicados: 1, pacientesAComunicar: 2 });
});

test("prazo vencido só vale para recolhimento em andamento", () => {
  const hoje = new Date("2026-10-16T00:00:00Z");
  const ontem = new Date("2026-10-15T00:00:00Z");
  assert.equal(prazoVencido(ontem, "ABERTO", hoje), true);
  assert.equal(prazoVencido(ontem, "EM_ANDAMENTO", hoje), true);
  assert.equal(prazoVencido(hoje, "ABERTO", hoje), false, "vence hoje ainda não está vencido");
  assert.equal(prazoVencido(ontem, "CONCLUIDO", hoje), false);
  assert.equal(prazoVencido(ontem, "CANCELADO", hoje), false);
  assert.equal(prazoVencido(null, "ABERTO", hoje), false);
});

test("tipo do movimento, plano de bloqueio e perfis", () => {
  assert.equal(tipoMovimentoRecolhimento("HOSPITAL"), "RETORNO");
  assert.equal(tipoMovimentoRecolhimento("DEPOSITO"), "TRANSFERENCIA");
  assert.equal(tipoMovimentoRecolhimento("QUARENTENA"), "TRANSFERENCIA");
  assert.deepEqual(planoBloqueio("LIBERADO"), { bloquear: true, bloqueadoPorEste: true });
  assert.deepEqual(planoBloqueio("QUARENTENA"), { bloquear: true, bloqueadoPorEste: true });
  assert.deepEqual(planoBloqueio("BLOQUEADO"), { bloquear: false, bloqueadoPorEste: false });
  assert.deepEqual(["ADMIN", "QUALIDADE", "ESTOQUE", "COMERCIAL", "COMPRAS", "FINANCEIRO"].map((p) => podeOperarRecolhimento(p as never)), [true, true, false, false, false, false]);
  assert.deepEqual(["ADMIN", "QUALIDADE", "ESTOQUE", "COMERCIAL", "COMPRAS"].map((p) => podeRecolherFisico(p as never)), [true, true, true, false, false]);
  assert.deepEqual(["ADMIN", "QUALIDADE", "ESTOQUE", "COMERCIAL"].map((p) => podeVerPacientes(p as never)), [true, true, false, false]);
});
