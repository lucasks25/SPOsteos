-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('ABERTO', 'CONTADO', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ResolucaoInventario" AS ENUM ('AJUSTE', 'COBRAR_HOSPITAL', 'JUSTIFICADA');

-- CreateTable
CREATE TABLE "InventarioConsignacao" (
    "id" SERIAL NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "status" "StatusInventario" NOT NULL DEFAULT 'ABERTO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT NOT NULL,
    "contadoEm" TIMESTAMP(3),
    "fechadoEm" TIMESTAMP(3),
    "fechadoPor" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "InventarioConsignacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioConsignacaoItem" (
    "id" TEXT NOT NULL,
    "inventarioId" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "saldoSistema" INTEGER NOT NULL,
    "contado" INTEGER,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "resolucao" "ResolucaoInventario",
    "justificativa" TEXT,
    "saldoFechamento" INTEGER,
    "diferenca" INTEGER,
    "valorCobrar" DECIMAL(14,2),

    CONSTRAINT "InventarioConsignacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventarioConsignacao_hospitalId_status_idx" ON "InventarioConsignacao"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "InventarioConsignacaoItem_produtoId_idx" ON "InventarioConsignacaoItem"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioConsignacaoItem_inventarioId_loteId_key" ON "InventarioConsignacaoItem"("inventarioId", "loteId");

-- AddForeignKey
ALTER TABLE "InventarioConsignacao" ADD CONSTRAINT "InventarioConsignacao_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConsignacao" ADD CONSTRAINT "InventarioConsignacao_localId_fkey" FOREIGN KEY ("localId") REFERENCES "LocalEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioConsignacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───── Travas ─────
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_contado_check" CHECK ("contado" IS NULL OR "contado" >= 0);
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_saldoSistema_check" CHECK ("saldoSistema" >= 0);
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_valorUnit_check" CHECK ("valorUnit" >= 0);
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_valorCobrar_check" CHECK ("valorCobrar" IS NULL OR "valorCobrar" >= 0);
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_justificativa_check"
  CHECK ("resolucao" IS DISTINCT FROM 'JUSTIFICADA' OR length(btrim(coalesce("justificativa", ''))) > 0);
-- cobrar do hospital exige valor registrado
ALTER TABLE "InventarioConsignacaoItem" ADD CONSTRAINT "InventarioConsignacaoItem_cobrar_check"
  CHECK ("resolucao" IS DISTINCT FROM 'COBRAR_HOSPITAL' OR "valorCobrar" IS NOT NULL);
-- inventário fechado tem data e responsável
ALTER TABLE "InventarioConsignacao" ADD CONSTRAINT "InventarioConsignacao_fechado_check" CHECK ("status" <> 'FECHADO' OR ("fechadoEm" IS NOT NULL AND "fechadoPor" IS NOT NULL));
-- um inventário em andamento por hospital
CREATE UNIQUE INDEX "InventarioConsignacao_um_em_andamento" ON "InventarioConsignacao"("localId") WHERE "status" IN ('ABERTO', 'CONTADO');
