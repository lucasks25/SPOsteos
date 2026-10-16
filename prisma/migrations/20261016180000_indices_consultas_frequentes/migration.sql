-- ARQ-13: índices para as consultas frequentes (listas, painel, rastreabilidade). Medição e índices rejeitados:
-- docs/ARQUITETURA.md (seção "Índices (ARQ-13)"); para medir de novo: scripts/explain-indices.sql.
-- Todos são btree simples declarados no schema.prisma (nenhum parcial: o `migrate diff` futuro não tenta removê-los).
-- Em produção com tabela grande, prefira aplicar à mão com CREATE INDEX CONCURRENTLY (não roda dentro da transação do migrate).

-- CreateIndex
CREATE INDEX "Cirurgia_dataHora_idx" ON "Cirurgia"("dataHora");

-- CreateIndex
CREATE INDEX "CirurgiaConsumo_cirurgiaId_idx" ON "CirurgiaConsumo"("cirurgiaId");

-- CreateIndex
CREATE INDEX "CirurgiaConsumo_loteId_idx" ON "CirurgiaConsumo"("loteId");

-- CreateIndex
CREATE INDEX "ContaPagar_status_vencimento_idx" ON "ContaPagar"("status", "vencimento");

-- CreateIndex
CREATE INDEX "ContaReceber_status_vencimento_idx" ON "ContaReceber"("status", "vencimento");

-- CreateIndex
CREATE INDEX "Lancamento_data_idx" ON "Lancamento"("data");

-- CreateIndex
CREATE INDEX "LogAuditoria_criadoEm_idx" ON "LogAuditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "PedidoVenda_status_faturadoEm_idx" ON "PedidoVenda"("status", "faturadoEm");

-- CreateIndex
CREATE INDEX "Remessa_cirurgiaId_idx" ON "Remessa"("cirurgiaId");

-- CreateIndex
CREATE INDEX "RemessaItem_remessaId_idx" ON "RemessaItem"("remessaId");

