-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "valorBaixado" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "valorBaixado" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "principal" DECIMAL(14,2),
ADD COLUMN     "transferenciaId" TEXT;

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lancamento_transferenciaId_idx" ON "Lancamento"("transferenciaId");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "Transferencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Dados existentes: toda baixa de título antiga é "principal = valor"; o título já extinto = o que foi pago
UPDATE "Lancamento" SET "principal" = "valor" WHERE "contaReceberId" IS NOT NULL OR "contaPagarId" IS NOT NULL;
UPDATE "ContaReceber" SET "valorBaixado" = "valorPago" WHERE "valorPago" IS NOT NULL;
UPDATE "ContaPagar" SET "valorBaixado" = "valorPago" WHERE "valorPago" IS NOT NULL;

-- Invariantes (o Prisma não declara CHECK no schema; ficam só aqui)
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_componentes_nao_negativos"
  CHECK ("juros" >= 0 AND "multa" >= 0 AND "desconto" >= 0 AND ("principal" IS NULL OR "principal" >= 0));
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_principal_so_em_baixa"
  CHECK (("principal" IS NOT NULL) = ("contaReceberId" IS NOT NULL OR "contaPagarId" IS NOT NULL));
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_valor_fecha_com_componentes"
  CHECK ("principal" IS NULL OR "valor" = "principal" + "juros" + "multa" - "desconto");
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_transferencia_sem_titulo_nem_acrescimo"
  CHECK ("transferenciaId" IS NULL OR ("contaReceberId" IS NULL AND "contaPagarId" IS NULL AND "juros" = 0 AND "multa" = 0 AND "desconto" = 0));
