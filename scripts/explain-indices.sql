-- Planos das consultas mais pesadas do sistema (ARQ-13). Só leitura: EXPLAIN (ANALYZE, BUFFERS) de SELECTs.
-- Uso (banco de desenvolvimento):
--   docker exec -i opme-db psql -U opme -d opme -v esquema=public < scripts/explain-indices.sql
-- Volume sintético (~5 anos de operação) num schema descartável, sem tocar nas tabelas reais:
--   docker exec -i opme-db psql -U opme -d opme < scripts/explain-indices-seed.sql   (cria bench_idx, ~15 s)
--   docker exec -i opme-db psql -U opme -d opme -v esquema=bench_idx < scripts/explain-indices.sql
--   docker exec -i opme-db psql -U opme -d opme -c 'DROP SCHEMA bench_idx CASCADE'
-- O seed copia a estrutura e os índices atuais (LIKE ... INCLUDING INDEXES); para testar um candidato,
-- crie o índice em bench_idx, rode ANALYZE e compare.
-- O que olhar: "Seq Scan" em tabela grande nas consultas de lista/painel, "Rows Removed by Filter" alto,
-- "Sort" com muitas linhas antes de um LIMIT e "Buffers: shared read" alto. As consultas espelham o SQL
-- que o Prisma gera nas telas citadas (simplificado: sem os JOINs de include).
\set ON_ERROR_STOP on
SET search_path = :esquema, public;
\pset pager off

-- ids de exemplo (os mais recentes; valor fictício se a tabela estiver vazia)
SELECT coalesce((SELECT id FROM "Cirurgia" ORDER BY "dataHora" DESC LIMIT 1), '-') AS cirurgia_id,
       coalesce((SELECT "loteId" FROM "CirurgiaConsumo" LIMIT 1), '-') AS lote_id,
       coalesce((SELECT id FROM "Remessa" ORDER BY id DESC LIMIT 1), 0) AS remessa_id,
       coalesce((SELECT "contaId" FROM "ExtratoLinha" LIMIT 1), '-') AS conta_id \gset

\echo '== Q01 financeiro/receber (padrão: ABERTO por vencimento) — financeiro/_lib/queries.ts listarTitulos'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "ContaReceber" WHERE status = 'ABERTO' ORDER BY vencimento ASC LIMIT 500;
\echo '== Q02 totais "vencido" (aggregate) — queries.ts / fluxo.ts / painel'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT sum(valor), sum("valorBaixado"), count(*) FROM "ContaReceber" WHERE status = 'ABERTO' AND vencimento < now();
\echo '== Q03 painel: a pagar nos próximos 15 dias — financeiro/_lib/painel.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id, valor, vencimento FROM "ContaPagar" WHERE status = 'ABERTO' AND vencimento < now() + interval '15 days' ORDER BY vencimento ASC LIMIT 8;
\echo '== Q04 fluxo de caixa: títulos em aberto na janela — financeiro/_lib/fluxo.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT vencimento, valor, "valorBaixado" FROM "ContaPagar" WHERE status = 'ABERTO' AND vencimento >= now() AND vencimento < now() + interval '90 days';
\echo '== Q05 lista PAGO (desc) — queries.ts com status=PAGO'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "ContaReceber" WHERE status = 'PAGO' ORDER BY vencimento DESC LIMIT 500;
\echo '== Q06 painel financeiro: entradas/saídas do mês (sem transferências) — painel.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT sentido, sum(valor) FROM "Lancamento" WHERE data >= date_trunc('month', now()) AND data < now() + interval '1 day' AND "transferenciaId" IS NULL GROUP BY sentido;
\echo '== Q07 conciliação: extrato não conciliado da conta — conciliacao.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "ExtratoLinha" WHERE "contaId" = :'conta_id' AND "lancamentoId" IS NULL ORDER BY data ASC LIMIT 100;
\echo '== Q08 comercial/cirurgias sem filtro (dataHora desc, take 300)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "Cirurgia" ORDER BY "dataHora" DESC LIMIT 300;
\echo '== Q09 painel: cirurgias nos próximos 7 dias — comercial/_lib/leitura-painel.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT count(*) FROM "Cirurgia" WHERE "dataHora" >= now() AND "dataHora" < now() + interval '7 days' AND status <> 'CANCELADA';
\echo '== Q10 detalhe da cirurgia: consumos — comercial/cirurgias/[id]'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "CirurgiaConsumo" WHERE "cirurgiaId" = :'cirurgia_id';
\echo '== Q11 lista de cirurgias: _count de consumos e remessas das 300 da página'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "cirurgiaId", count(*) FROM "CirurgiaConsumo" WHERE "cirurgiaId" IN (SELECT id FROM "Cirurgia" ORDER BY "dataHora" DESC LIMIT 300) GROUP BY "cirurgiaId";
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "cirurgiaId", count(*) FROM "Remessa" WHERE "cirurgiaId" IN (SELECT id FROM "Cirurgia" ORDER BY "dataHora" DESC LIMIT 300) GROUP BY "cirurgiaId";
\echo '== Q12 rastreabilidade/recall: pacientes de um lote — qualidade/_lib/rastreio.ts, recolhimento-servico.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "CirurgiaConsumo" WHERE "loteId" = :'lote_id';
\echo '== Q13 detalhe da remessa: itens — estoque/remessas/[id]'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "RemessaItem" WHERE "remessaId" = :remessa_id;
\echo '== Q14 kardex filtrado só por local (OR origem/destino) — estoque/kardex'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "Movimento" WHERE ("origemId" = 'loc-h7' OR "destinoId" = 'loc-h7') ORDER BY "criadoEm" ASC LIMIT 50;
\echo '== Q15 lotes disponíveis no depósito (gerar remessa) — estoque/_lib/remessas.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT s.* FROM "Saldo" s JOIN "Lote" l ON l.id = s."loteId" WHERE s."localId" = 'local-deposito' AND s.quantidade > 0 AND l.status = 'LIBERADO' AND l.validade >= now() ORDER BY l.validade, l.numero;
\echo '== Q16 painel/comissões/DRE: pedidos faturados nos últimos 6 meses — leitura-painel.ts, gestao/_lib/dados.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "faturadoEm", total, "custoTotal" FROM "PedidoVenda" WHERE status = 'FATURADO' AND "faturadoEm" >= now() - interval '6 months';
\echo '== Q17 admin/auditoria: primeira página (criadoEm desc)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT * FROM "LogAuditoria" ORDER BY "criadoEm" DESC LIMIT 50;
\echo '== Q18 painel qualidade: lotes em quarentena com saldo — qualidade/_lib/leitura-painel.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT count(*) FROM "Lote" l WHERE l.status = 'QUARENTENA' AND EXISTS (SELECT 1 FROM "Saldo" s WHERE s."loteId" = l.id AND s.quantidade > 0);
\echo '== Q19 gestão: consumo por produto em 90 dias — gestao/_lib/dados.ts, compras/sugestao'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT "produtoId", sum(quantidade) FROM "Movimento" WHERE tipo = 'CONSUMO' AND "criadoEm" >= now() - interval '90 days' GROUP BY "produtoId";
\echo '== Q20 busca global (contains, insensitive) — src/app/api/busca/route.ts'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id, descricao, status FROM "ContaReceber" WHERE descricao ILIKE '%hospital 17%' ORDER BY vencimento DESC LIMIT 5;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT id, paciente FROM "Cirurgia" WHERE paciente ILIKE '%paciente 2431%' ORDER BY "dataHora" DESC LIMIT 5;
