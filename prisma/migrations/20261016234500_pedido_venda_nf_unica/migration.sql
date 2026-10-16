-- Mesma NF em dois pedidos de venda ativos = venda contada duas vezes no DRE e duas cobranças ao hospital.
-- registrarNfTx confere antes de gravar, mas sem trava: dois registros simultâneos passavam. Última defesa no banco.
-- Só adiciona o índice (não altera dados). O Prisma não declara índice parcial: ao gerar migrations futuras com
-- `migrate diff`, apague o DROP INDEX desta linha.
CREATE UNIQUE INDEX "PedidoVenda_numeroNf_ativo_key" ON "PedidoVenda"("numeroNf") WHERE "numeroNf" IS NOT NULL AND "status" <> 'CANCELADO';
