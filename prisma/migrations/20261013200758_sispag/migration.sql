-- CreateEnum
CREATE TYPE "StatusPagamentoBanco" AS ENUM ('ENVIADO', 'AGENDADO', 'PAGO', 'REJEITADO');

-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN     "titularCnpj" TEXT,
ADD COLUMN     "titularNome" TEXT;

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "codigoBarras" TEXT;

-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN     "agencia" TEXT,
ADD COLUMN     "bancoCodigo" TEXT,
ADD COLUMN     "chavePix" TEXT,
ADD COLUMN     "conta" TEXT,
ADD COLUMN     "contaDigito" TEXT;

-- CreateTable
CREATE TABLE "RemessaPagamento" (
    "id" SERIAL NOT NULL,
    "contaId" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "dataPagto" TIMESTAMP(3) NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retornoEm" TIMESTAMP(3),

    CONSTRAINT "RemessaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemessaPagamentoItem" (
    "id" SERIAL NOT NULL,
    "remessaId" INTEGER NOT NULL,
    "contaPagarId" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" "StatusPagamentoBanco" NOT NULL DEFAULT 'ENVIADO',
    "ocorrencias" TEXT,
    "nossoNumero" TEXT,

    CONSTRAINT "RemessaPagamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemessaPagamentoItem_contaPagarId_idx" ON "RemessaPagamentoItem"("contaPagarId");

-- AddForeignKey
ALTER TABLE "RemessaPagamento" ADD CONSTRAINT "RemessaPagamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaPagamentoItem" ADD CONSTRAINT "RemessaPagamentoItem_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "RemessaPagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaPagamentoItem" ADD CONSTRAINT "RemessaPagamentoItem_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

