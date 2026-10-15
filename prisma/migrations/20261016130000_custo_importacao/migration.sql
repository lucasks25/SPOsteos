-- CreateEnum
CREATE TYPE "TipoCambio" AS ENUM ('PTAX', 'CONTRATADO');

-- CreateEnum
CREATE TYPE "TipoDespesaImportacao" AS ENUM ('FRETE_INTERNACIONAL', 'SEGURO', 'II', 'IPI', 'PIS_IMPORTACAO', 'COFINS_IMPORTACAO', 'ICMS', 'AFRMM', 'DESPACHANTE', 'ARMAZENAGEM', 'CAPATAZIA', 'TRANSPORTE_NACIONAL', 'OUTRA');

-- CreateEnum
CREATE TYPE "CriterioRateio" AS ENUM ('VALOR', 'QUANTIDADE', 'PESO');

-- AlterTable
ALTER TABLE "PedidoCompra" ADD COLUMN     "cambio" DECIMAL(12,6),
ADD COLUMN     "dataDesembaraco" TIMESTAMP(3),
ADD COLUMN     "dataInvoice" TIMESTAMP(3),
ADD COLUMN     "dataRegistroDi" TIMESTAMP(3),
ADD COLUMN     "incoterm" TEXT,
ADD COLUMN     "moeda" CHAR(3) NOT NULL DEFAULT 'BRL',
ADD COLUMN     "tipoCambio" "TipoCambio";

-- AlterTable
ALTER TABLE "PedidoCompraItem" ADD COLUMN     "pesoKg" DECIMAL(12,3),
ADD COLUMN     "precoMoeda" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "PedidoCompraDespesa" (
    "id" TEXT NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "tipo" "TipoDespesaImportacao" NOT NULL,
    "descricao" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "integraCusto" BOOLEAN NOT NULL,
    "criterio" "CriterioRateio" NOT NULL DEFAULT 'VALOR',
    "itemId" TEXT,
    "contaPagarId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoCompraDespesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompraDespesa_contaPagarId_key" ON "PedidoCompraDespesa"("contaPagarId");

-- CreateIndex
CREATE INDEX "PedidoCompraDespesa_pedidoId_idx" ON "PedidoCompraDespesa"("pedidoId");

-- AddForeignKey
ALTER TABLE "PedidoCompraDespesa" ADD CONSTRAINT "PedidoCompraDespesa_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraDespesa" ADD CONSTRAINT "PedidoCompraDespesa_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PedidoCompraItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraDespesa" ADD CONSTRAINT "PedidoCompraDespesa_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───── Travas (o Prisma não declara CHECK; ficam só aqui) ─────
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_moeda_check" CHECK ("moeda" ~ '^[A-Z]{3}$');
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_cambio_check" CHECK ("cambio" IS NULL OR "cambio" > 0);
-- moeda estrangeira exige câmbio; pedido nacional é sempre em reais
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_moeda_cambio_check" CHECK ("moeda" = 'BRL' OR "cambio" IS NOT NULL);
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_nacional_brl_check" CHECK ("importacao" OR "moeda" = 'BRL');
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_precoMoeda_check" CHECK ("precoMoeda" IS NULL OR "precoMoeda" >= 0);
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_pesoKg_check" CHECK ("pesoKg" IS NULL OR "pesoKg" >= 0);
ALTER TABLE "PedidoCompraDespesa" ADD CONSTRAINT "PedidoCompraDespesa_valor_check" CHECK ("valor" >= 0);

-- Pedidos de importação já existentes eram em reais: preço na moeda = custo em reais.
UPDATE "PedidoCompraItem" i SET "precoMoeda" = i."custoUnit"
  FROM "PedidoCompra" p WHERE p."id" = i."pedidoId" AND p."importacao" AND i."precoMoeda" IS NULL;

-- ───── Plano de contas ─────
-- 3.03 vira conta do sistema: despesa de importação que NÃO integra o custo vai ao resultado aqui.
UPDATE "PlanoConta" SET "chaveSistema" = 'CUSTO_IMPORTACAO' WHERE "id" = 'pc_3.03' AND "chaveSistema" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "PlanoConta" WHERE "chaveSistema" = 'CUSTO_IMPORTACAO');
-- Tributos recuperáveis da importação (IPI, PIS, COFINS, ICMS com crédito): ativo, fora do resultado.
INSERT INTO "PlanoConta" ("id","codigo","nome","tipo","paiId","analitica","chaveSistema")
SELECT 'pc_8.tributos_recuperar', '8.04', 'Tributos a recuperar (importação)', 'NAO_RESULTADO'::"TipoPlano", 'pc_8', true, 'TRIBUTOS_RECUPERAR'
WHERE EXISTS (SELECT 1 FROM "PlanoConta" WHERE "id" = 'pc_8')
  AND NOT EXISTS (SELECT 1 FROM "PlanoConta" WHERE "codigo" = '8.04' OR "chaveSistema" = 'TRIBUTOS_RECUPERAR');
