-- Segregação de funções nas contas a pagar (docs/REVISAO.md §21): quem criou ou alterou valor/vencimento/fornecedor/boleto
-- desde a última aprovação não aprova. Contas existentes ficam como estão (criadoPor nulo, sem alteração pendente).
-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "alteradoPor" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "criadoPor" TEXT;

