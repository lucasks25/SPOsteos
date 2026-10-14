-- AlterEnum
ALTER TYPE "StatusPagamentoBanco" ADD VALUE 'CANCELADO';

-- AlterTable
ALTER TABLE "RemessaPagamento" ADD COLUMN     "canceladaEm" TIMESTAMP(3),
ADD COLUMN     "canceladaMotivo" TEXT;


-- Um título só pode ter um pagamento ativo (enviado ou agendado) por vez: última defesa contra pagar duas vezes.
-- O Prisma não declara índice parcial: ao gerar migrations futuras com `migrate diff`, apague o DROP INDEX desta linha.
CREATE UNIQUE INDEX "RemessaPagamentoItem_titulo_ativo_key" ON "RemessaPagamentoItem"("contaPagarId") WHERE "status" IN ('ENVIADO', 'AGENDADO');
