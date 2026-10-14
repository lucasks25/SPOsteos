-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('BANCO', 'CAIXA');

-- CreateEnum
CREATE TYPE "SentidoLancamento" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'BOLETO', 'TED', 'DINHEIRO', 'CARTAO', 'CHEQUE', 'OUTRO');

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL DEFAULT 'BANCO',
    "banco" TEXT,
    "agencia" TEXT,
    "numero" TEXT,
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "sentido" "SentidoLancamento" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "forma" "FormaPagamento",
    "categoria" TEXT,
    "contaReceberId" TEXT,
    "contaPagarId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtratoLinha" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "fitid" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "conciliadoEm" TIMESTAMP(3),
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtratoLinha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lancamento_contaId_data_idx" ON "Lancamento"("contaId", "data");

-- CreateIndex
CREATE INDEX "Lancamento_contaReceberId_idx" ON "Lancamento"("contaReceberId");

-- CreateIndex
CREATE INDEX "Lancamento_contaPagarId_idx" ON "Lancamento"("contaPagarId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtratoLinha_lancamentoId_key" ON "ExtratoLinha"("lancamentoId");

-- CreateIndex
CREATE INDEX "ExtratoLinha_contaId_data_idx" ON "ExtratoLinha"("contaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "ExtratoLinha_contaId_fitid_key" ON "ExtratoLinha"("contaId", "fitid");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtratoLinha" ADD CONSTRAINT "ExtratoLinha_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtratoLinha" ADD CONSTRAINT "ExtratoLinha_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
