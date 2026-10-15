-- CreateEnum
CREATE TYPE "StatusCobrancaItem" AS ENUM ('ENVIADO', 'CONFIRMADO', 'REJEITADO', 'LIQUIDADO', 'BAIXADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN     "carteiraCobranca" TEXT,
ADD COLUMN     "cobrancaJurosMensalPercent" DECIMAL(5,2) NOT NULL DEFAULT 1,
ADD COLUMN     "cobrancaMultaPercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
ADD COLUMN     "proximoNossoNumero" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "cobrancaContaId" TEXT,
ADD COLUMN     "cobrancaStatus" TEXT,
ADD COLUMN     "nossoNumero" TEXT;

-- CreateTable
CREATE TABLE "RemessaCobranca" (
    "id" SERIAL NOT NULL,
    "contaId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retornoEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "canceladaMotivo" TEXT,

    CONSTRAINT "RemessaCobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemessaCobrancaItem" (
    "id" SERIAL NOT NULL,
    "remessaId" INTEGER NOT NULL,
    "contaReceberId" TEXT NOT NULL,
    "ocorrencia" TEXT NOT NULL,
    "nossoNumero" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" "StatusCobrancaItem" NOT NULL DEFAULT 'ENVIADO',
    "motivos" TEXT,

    CONSTRAINT "RemessaCobrancaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CobrancaEvento" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "nossoNumero" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CobrancaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RemessaCobrancaItem_contaReceberId_idx" ON "RemessaCobrancaItem"("contaReceberId");

-- CreateIndex
CREATE INDEX "RemessaCobrancaItem_remessaId_idx" ON "RemessaCobrancaItem"("remessaId");

-- CreateIndex
CREATE UNIQUE INDEX "CobrancaEvento_contaId_nossoNumero_codigo_data_key" ON "CobrancaEvento"("contaId", "nossoNumero", "codigo", "data");

-- CreateIndex
CREATE UNIQUE INDEX "ContaReceber_cobrancaContaId_nossoNumero_key" ON "ContaReceber"("cobrancaContaId", "nossoNumero");

-- AddForeignKey
ALTER TABLE "RemessaCobranca" ADD CONSTRAINT "RemessaCobranca_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaCobrancaItem" ADD CONSTRAINT "RemessaCobrancaItem_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "RemessaCobranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaCobrancaItem" ADD CONSTRAINT "RemessaCobrancaItem_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_carteira_cobranca" CHECK ("carteiraCobranca" IS NULL OR "carteiraCobranca" = '109');
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_cobranca_percentuais" CHECK ("cobrancaMultaPercent" BETWEEN 0 AND 20 AND "cobrancaJurosMensalPercent" BETWEEN 0 AND 20);
-- nosso número cabe em 8 dígitos
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_nosso_numero_8" CHECK ("proximoNossoNumero" BETWEEN 1 AND 100000000);
