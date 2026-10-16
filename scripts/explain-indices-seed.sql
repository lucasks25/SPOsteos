-- Schema descartável bench_idx com dados sintéticos (horizonte ~5 anos de operação) para scripts/explain-indices.sql.
-- Não toca nas tabelas reais: cria tabelas LIKE public.* (estrutura + índices, sem FKs nem CHECKs) e ids explícitos
-- (não consome as sequences reais). Apague no fim: DROP SCHEMA bench_idx CASCADE.
-- Volumes: LogAuditoria 1M, Movimento 600k, CirurgiaConsumo/RemessaItem 200k, Lancamento 120k, títulos 110k, Cirurgia 25k.
DROP SCHEMA IF EXISTS bench_idx CASCADE;
CREATE SCHEMA bench_idx;
SET search_path = bench_idx, public;
SELECT setseed(0.42);

CREATE TABLE bench_idx."ContaReceber" (LIKE public."ContaReceber" INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."ContaPagar"   (LIKE public."ContaPagar"   INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."Lancamento"   (LIKE public."Lancamento"   INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."Cirurgia"     (LIKE public."Cirurgia"     INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."CirurgiaConsumo" (LIKE public."CirurgiaConsumo" INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."Remessa"      (LIKE public."Remessa"      INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."RemessaItem"  (LIKE public."RemessaItem"  INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."Movimento"    (LIKE public."Movimento"    INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."Saldo"        (LIKE public."Saldo"        INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."Lote"         (LIKE public."Lote"         INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."PedidoVenda"  (LIKE public."PedidoVenda"  INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."LogAuditoria" (LIKE public."LogAuditoria" INCLUDING DEFAULTS INCLUDING INDEXES);
CREATE TABLE bench_idx."ExtratoLinha" (LIKE public."ExtratoLinha" INCLUDING DEFAULTS INCLUDING INDEXES);

-- títulos: 50k a receber / 60k a pagar em 5 anos; ~6% em aberto (recentes), 3% cancelados
INSERT INTO "ContaReceber"(id, descricao, "hospitalId", valor, vencimento, status, competencia, "valorBaixado")
SELECT 'cr'||g, 'Pedido '||g||' hospital '||(g%50), 'h'||(g%50), 1000+(g%5000),
       now() - interval '5 years' + (g * interval '5 years' / 50000) + interval '30 days',
       (CASE WHEN g > 47000 AND random() < 0.9 THEN 'ABERTO' WHEN random() < 0.03 THEN 'CANCELADO' WHEN g > 47000 THEN 'PAGO' ELSE 'PAGO' END)::"StatusTitulo",
       now() - interval '5 years' + (g * interval '5 years' / 50000), 0
FROM generate_series(1, 50000) g;
UPDATE "ContaReceber" SET status = 'ABERTO' WHERE random() < 0.01; -- inadimplência antiga espalhada

INSERT INTO "ContaPagar"(id, descricao, "fornecedorId", "pedidoId", valor, vencimento, status, competencia, "valorBaixado", "aprovadoEm")
SELECT 'cp'||g, 'Compra '||g||' fornecedor '||(g%200), 'f'||(g%200), g/5, 500+(g%3000),
       now() - interval '5 years' + (g * interval '5 years' / 60000) + interval '30 days',
       (CASE WHEN g > 57000 AND random() < 0.9 THEN 'ABERTO' WHEN random() < 0.03 THEN 'CANCELADO' ELSE 'PAGO' END)::"StatusTitulo",
       now() - interval '5 years' + (g * interval '5 years' / 60000), 0, now()
FROM generate_series(1, 60000) g;

-- 120k lançamentos em 5 contas
INSERT INTO "Lancamento"(id, "contaId", data, sentido, valor, descricao, "contaReceberId", "contaPagarId", principal, "transferenciaId")
SELECT 'l'||g, 'cb'||(g%5), now() - interval '5 years' + (g * interval '5 years' / 120000),
       (CASE WHEN g%2=0 THEN 'ENTRADA' ELSE 'SAIDA' END)::"SentidoLancamento", 100+(g%900), 'lanc '||g,
       CASE WHEN g%2=0 AND g%10<>0 THEN 'cr'||(g/2.4)::int END, CASE WHEN g%2=1 AND g%10<>1 THEN 'cp'||(g/2)::int END,
       CASE WHEN g%10 NOT IN (0,1) THEN 100+(g%900) END,
       CASE WHEN g%20=0 THEN 't'||g END
FROM generate_series(1, 120000) g;

-- 30k linhas de extrato, 3% não conciliadas
INSERT INTO "ExtratoLinha"(id, "contaId", data, valor, descricao, fitid, origem, "lancamentoId")
SELECT 'e'||g, 'cb'||(g%5), now() - interval '5 years' + (g * interval '5 years' / 30000), 100, 'ext '||g, 'fit'||g, 'OFX',
       CASE WHEN g < 29100 THEN 'l'||g END
FROM generate_series(1, 30000) g;

-- 25k cirurgias em 50 hospitais, 5 anos + 60 dias futuros
INSERT INTO "Cirurgia"(id, numero, "dataHora", "hospitalId", "medicoId", paciente, status)
SELECT 'c'||g, g, now() - interval '5 years' + (g * (interval '5 years' + interval '60 days') / 25000), 'h'||(g%50), 'm'||(g%300), 'Paciente '||g,
       (CASE WHEN g > 24200 THEN (ARRAY['AGENDADA','CONFIRMADA'])[1+g%2] WHEN g%25=0 THEN 'CANCELADA' WHEN g > 23500 THEN 'REALIZADA' ELSE 'FATURADA' END)::"StatusCirurgia"
FROM generate_series(1, 25000) g;

-- 20k lotes de 2000 produtos
INSERT INTO "Lote"(id, "produtoId", numero, validade, status, "criadoEm")
SELECT 'lt'||g, 'p'||(g%2000), 'L'||g, now() - interval '3 years' + (g * interval '8 years' / 20000),
       (CASE WHEN g > 19800 THEN 'QUARENTENA' WHEN g%100=0 THEN 'BLOQUEADO' ELSE 'LIBERADO' END)::"StatusLote",
       now() - interval '5 years' + (g * interval '5 years' / 20000)
FROM generate_series(1, 20000) g;

-- 200k consumos (8 por cirurgia)
INSERT INTO "CirurgiaConsumo"(id, "cirurgiaId", "produtoId", "loteId", quantidade)
SELECT 'cc'||g, 'c'||(1+(g-1)/8), 'p'||(g%2000), 'lt'||(1+((g::bigint*7919)%20000)), 1 FROM generate_series(1, 200000) g;

-- 25k remessas, 200k itens
INSERT INTO "Remessa"(id, "localId", "cirurgiaId", status, "criadoEm")
SELECT g, 'loc-h'||(g%50), 'c'||g, (CASE WHEN g > 24800 THEN 'ABERTA' WHEN g > 24000 THEN 'ENVIADA' WHEN g%30=0 THEN 'CANCELADA' ELSE 'CONFERIDA' END)::"StatusRemessa",
       now() - interval '5 years' + (g * interval '5 years' / 25000)
FROM generate_series(1, 25000) g;
INSERT INTO "RemessaItem"(id, "remessaId", "produtoId", "loteId", quantidade)
SELECT 'ri'||g, 1+(g-1)/8, 'p'||(g%2000), 'lt'||(1+((g::bigint*104729)%20000)), 2 FROM generate_series(1, 200000) g;

-- saldo: 20k lotes × ~4 locais (inclusive linhas zeradas, que nunca são apagadas)
INSERT INTO "Saldo"(id, "produtoId", "loteId", "localId", quantidade)
SELECT 's'||l||'_'||k, 'p'||(l%2000), 'lt'||l,
       CASE k WHEN 0 THEN 'local-deposito' WHEN 1 THEN 'local-quarentena' ELSE 'loc-h'||((l+k*17)%50) END,
       CASE WHEN l > 15000 THEN (l%7) ELSE 0 END
FROM generate_series(1, 20000) l, generate_series(0, 3) k;

-- 600k movimentos
INSERT INTO "Movimento"(id, tipo, "produtoId", "loteId", "origemId", "destinoId", quantidade, "criadoEm")
SELECT 'mv'||g, (ARRAY['ENTRADA','TRANSFERENCIA','REMESSA','CONSUMO','RETORNO','REMESSA','CONSUMO','AJUSTE'])[1+g%8]::"TipoMovimento",
       'p'||(g%2000), 'lt'||(1+(g%20000)),
       CASE WHEN g%8 IN (1,2) THEN 'local-deposito' WHEN g%8 IN (3,4,6) THEN 'loc-h'||(g%50) END,
       CASE WHEN g%8 IN (0) THEN 'local-quarentena' WHEN g%8=1 THEN 'local-deposito' WHEN g%8 IN (2,5) THEN 'loc-h'||(g%50) WHEN g%8=4 THEN 'local-deposito' END,
       1, now() - interval '5 years' + (g * interval '5 years' / 600000)
FROM generate_series(1, 600000) g;

-- 25k pedidos de venda
INSERT INTO "PedidoVenda"(id, "hospitalId", status, total, "custoTotal", "criadoEm", "faturadoEm")
SELECT g, 'h'||(g%50), (CASE WHEN g > 24800 THEN 'ABERTO' WHEN g%40=0 THEN 'CANCELADO' ELSE 'FATURADO' END)::"StatusPedidoVenda", 10000, 6000,
       now() - interval '5 years' + (g * interval '5 years' / 25000),
       CASE WHEN g <= 24800 AND g%40<>0 THEN now() - interval '5 years' + (g * interval '5 years' / 25000) END
FROM generate_series(1, 25000) g;

-- 1M linhas de auditoria
INSERT INTO "LogAuditoria"(id, "usuarioId", acao, entidade, "entidadeId", detalhes, "criadoEm")
SELECT 'la'||g, 'u'||(g%10), (ARRAY['CRIAR','EDITAR','EXCLUIR'])[1+g%3], (ARRAY['ContaReceber','ContaPagar','Cirurgia','Remessa','Lote','Produto'])[1+g%6], 'x'||g, '{"a":1}',
       now() - interval '5 years' + (g * interval '5 years' / 1000000)
FROM generate_series(1, 1000000) g;

\echo 'bench_idx pronto'
VACUUM ANALYZE bench_idx."ContaReceber"; VACUUM ANALYZE bench_idx."ContaPagar"; VACUUM ANALYZE bench_idx."Lancamento"; VACUUM ANALYZE bench_idx."Cirurgia";
VACUUM ANALYZE bench_idx."CirurgiaConsumo"; VACUUM ANALYZE bench_idx."Remessa"; VACUUM ANALYZE bench_idx."RemessaItem"; VACUUM ANALYZE bench_idx."Movimento";
VACUUM ANALYZE bench_idx."Saldo"; VACUUM ANALYZE bench_idx."Lote"; VACUUM ANALYZE bench_idx."PedidoVenda"; VACUUM ANALYZE bench_idx."LogAuditoria"; VACUUM ANALYZE bench_idx."ExtratoLinha";
