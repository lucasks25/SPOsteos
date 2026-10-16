/**
 * Invariantes globais (auditoria de dados) reutilizáveis: valem para o banco INTEIRO, não só para os dados do teste.
 * Usadas no fim de cada cadeia de integração (integracao-*.test.ts) e em financeiro-invariantes.test.ts.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { listarContas } from "@/app/(app)/financeiro/_lib/contas";

const cent = (n: number) => Math.round(n * 100);

/** Todo título fecha com seus lançamentos e glosas; toda conta, transferência e conciliação fecha. */
export async function conferirInvariantesFinanceiras() {
  const titulosReceber = await db.$queryRaw<{ id: string; descricao: string }[]>`
    WITH l AS (SELECT "contaReceberId" AS id, SUM(valor) AS pago, SUM(COALESCE(principal, 0) + desconto) AS baix, MAX(data) AS ult
               FROM "Lancamento" WHERE "contaReceberId" IS NOT NULL GROUP BY 1),
         g AS (SELECT "contaReceberId" AS id, SUM(valor) AS glos, MAX(data) AS ult FROM "Glosa" WHERE recurso <> 'REVERTIDA' GROUP BY 1),
         t AS (SELECT c.id, c.descricao, c.valor, c.status::text AS status, c."valorPago", c."valorBaixado", c."pagoEm", l.pago,
                      CASE WHEN l.id IS NULL AND g.id IS NULL THEN NULL ELSE COALESCE(l.baix, 0) + COALESCE(g.glos, 0) END AS baixado,
                      GREATEST(l.ult, g.ult) AS ult
               FROM "ContaReceber" c LEFT JOIN l ON l.id = c.id LEFT JOIN g ON g.id = c.id)
    SELECT id, descricao FROM t
    WHERE "valorPago" IS DISTINCT FROM pago OR "valorBaixado" IS DISTINCT FROM baixado OR "pagoEm" IS DISTINCT FROM ult
       OR COALESCE("valorBaixado", 0) > valor
       OR NOT ((status = 'CANCELADO' AND "valorBaixado" IS NULL) OR (status = 'PAGO' AND "valorBaixado" >= valor)
               OR (status = 'ABERTO' AND COALESCE("valorBaixado", 0) < valor))`;
  assert.deepEqual(titulosReceber, [], "contas a receber cujo valorPago/valorBaixado/pagoEm/status não fecha com lançamentos + glosas");

  const titulosPagar = await db.$queryRaw<{ id: string; descricao: string }[]>`
    WITH l AS (SELECT "contaPagarId" AS id, SUM(valor) AS pago, SUM(COALESCE(principal, 0) + desconto) AS baix, MAX(data) AS ult
               FROM "Lancamento" WHERE "contaPagarId" IS NOT NULL GROUP BY 1)
    SELECT c.id, c.descricao FROM "ContaPagar" c LEFT JOIN l ON l.id = c.id
    WHERE c."valorPago" IS DISTINCT FROM l.pago OR c."valorBaixado" IS DISTINCT FROM l.baix OR c."pagoEm" IS DISTINCT FROM l.ult
       OR COALESCE(c."valorBaixado", 0) > c.valor
       OR NOT ((c.status = 'CANCELADO' AND c."valorBaixado" IS NULL) OR (c.status = 'PAGO' AND c."valorBaixado" >= c.valor)
               OR (c.status = 'ABERTO' AND COALESCE(c."valorBaixado", 0) < c.valor))`;
  assert.deepEqual(titulosPagar, [], "contas a pagar cujo valorPago/valorBaixado/pagoEm/status não fecha com os lançamentos");

  const lancamentos = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Lancamento"
    WHERE (("contaReceberId" IS NOT NULL)::int + ("contaPagarId" IS NOT NULL)::int + ("transferenciaId" IS NOT NULL)::int) > 1
       OR ("contaReceberId" IS NOT NULL AND sentido <> 'ENTRADA') OR ("contaPagarId" IS NOT NULL AND sentido <> 'SAIDA')
       OR (("contaReceberId" IS NOT NULL OR "contaPagarId" IS NOT NULL) AND (principal IS NULL OR valor <> principal + juros + multa))
       OR valor <= 0`;
  assert.deepEqual(lancamentos, [], "lançamentos com vínculo duplo, sentido trocado ou valor ≠ principal + juros + multa");

  const transferencias = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "Transferencia" t LEFT JOIN "Lancamento" l ON l."transferenciaId" = t.id
    GROUP BY t.id, t.valor, t.data
    HAVING COUNT(l.id) <> 2 OR COUNT(*) FILTER (WHERE l.sentido = 'SAIDA') <> 1 OR COUNT(*) FILTER (WHERE l.sentido = 'ENTRADA') <> 1
        OR COUNT(DISTINCT l."contaId") <> 2 OR bool_or(l.valor <> t.valor) OR bool_or(l.data <> t.data)`;
  assert.deepEqual(transferencias, [], "transferências sem exatamente uma SAIDA e uma ENTRADA do mesmo valor e data em contas diferentes");

  const conciliadas = await db.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM "ExtratoLinha" e JOIN "Lancamento" l ON l.id = e."lancamentoId"
    WHERE l."contaId" <> e."contaId" OR abs(e.valor) <> l.valor OR (e.valor > 0) <> (l.sentido = 'ENTRADA')`;
  assert.deepEqual(conciliadas, [], "linhas de extrato conciliadas com lançamento de outra conta, sentido ou valor");

  const sql = await db.$queryRaw<{ id: string; nome: string; ativo: boolean; saldo: string }[]>`
    SELECT c.id, c.nome, c.ativo, (c."saldoInicial" + COALESCE(SUM(CASE WHEN l.sentido = 'ENTRADA' THEN l.valor ELSE -l.valor END), 0))::text AS saldo
    FROM "ContaBancaria" c LEFT JOIN "Lancamento" l ON l."contaId" = c.id GROUP BY c.id`;
  const tela = new Map((await listarContas()).map((c) => [c.id, c.saldo]));
  const divergentes = sql.filter((c) => cent(Number(c.saldo)) !== cent(tela.get(c.id) ?? NaN)).map((c) => `${c.nome}: banco ${c.saldo} × tela ${tela.get(c.id)}`);
  assert.deepEqual(divergentes, [], "saldo da conta na tela ≠ saldo inicial + entradas − saídas");
  const inativasComSaldo = sql.filter((c) => !c.ativo && cent(Number(c.saldo)) !== 0).map((c) => `${c.nome}: ${c.saldo}`);
  assert.deepEqual(inativasComSaldo, [], "conta inativa com saldo: painel e fluxo deixam de fechar");
}

/** Estoque: para todo (lote, local), Saldo == Σ kardex (destino − origem), e nenhum saldo negativo. Banco inteiro. */
export async function conferirSaldoIgualKardex() {
  const divergentes = await db.$queryRaw<{ lote: string; local: string; saldo: number | null; kardex: number | null }[]>`
    WITH k AS (
      SELECT "loteId", local, SUM(q)::int AS q FROM (
        SELECT "loteId", "destinoId" AS local, quantidade AS q FROM "Movimento" WHERE "destinoId" IS NOT NULL
        UNION ALL SELECT "loteId", "origemId", -quantidade FROM "Movimento" WHERE "origemId" IS NOT NULL) x
      GROUP BY 1, 2)
    SELECT COALESCE(s."loteId", k."loteId") AS lote, COALESCE(s."localId", k.local) AS local, s.quantidade AS saldo, k.q AS kardex
    FROM "Saldo" s FULL JOIN k ON k."loteId" = s."loteId" AND k.local = s."localId"
    WHERE COALESCE(s.quantidade, 0) <> COALESCE(k.q, 0) OR s.quantidade < 0`;
  assert.deepEqual(divergentes, [], "saldo de estoque ≠ soma do kardex (ou negativo)");
}

/** As duas auditorias: chamar no fim de cada cadeia ponta a ponta. */
export async function conferirTudo() {
  await conferirInvariantesFinanceiras();
  await conferirSaldoIgualKardex();
}
