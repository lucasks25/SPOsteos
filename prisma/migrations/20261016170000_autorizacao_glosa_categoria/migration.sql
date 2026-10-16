-- CreateEnum
CREATE TYPE "StatusAutorizacao" AS ENUM ('SOLICITADA', 'AUTORIZADA', 'PARCIAL', 'NEGADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "CategoriaGlosa" AS ENUM ('SEM_AUTORIZACAO', 'DIVERGENCIA_MATERIAL_GUIA', 'SEM_JUSTIFICATIVA_TECNICA', 'ADMINISTRATIVA', 'TECNICA', 'LINEAR', 'OUTRA');

-- CreateEnum
CREATE TYPE "RecursoGlosa" AS ENUM ('NENHUM', 'EM_RECURSO', 'REVERTIDA', 'MANTIDA');

-- AlterTable
ALTER TABLE "Convenio" ADD COLUMN     "exigeAutorizacao" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Glosa" ADD COLUMN     "categoria" "CategoriaGlosa" NOT NULL DEFAULT 'OUTRA',
ADD COLUMN     "recurso" "RecursoGlosa" NOT NULL DEFAULT 'NENHUM',
ADD COLUMN     "recursoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AutorizacaoConvenio" (
    "id" TEXT NOT NULL,
    "cirurgiaId" TEXT NOT NULL,
    "numeroGuia" TEXT,
    "senha" TEXT,
    "status" "StatusAutorizacao" NOT NULL DEFAULT 'SOLICITADA',
    "solicitadaEm" TIMESTAMP(3) NOT NULL,
    "autorizadaEm" TIMESTAMP(3),
    "validade" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutorizacaoConvenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutorizacaoItem" (
    "id" TEXT NOT NULL,
    "autorizacaoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidadeSolicitada" INTEGER NOT NULL,
    "quantidadeAutorizada" INTEGER NOT NULL DEFAULT 0,
    "valorAutorizado" DECIMAL(14,2),

    CONSTRAINT "AutorizacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutorizacaoConvenio_cirurgiaId_idx" ON "AutorizacaoConvenio"("cirurgiaId");

-- CreateIndex
CREATE UNIQUE INDEX "AutorizacaoItem_autorizacaoId_produtoId_key" ON "AutorizacaoItem"("autorizacaoId", "produtoId");

-- AddForeignKey
ALTER TABLE "AutorizacaoConvenio" ADD CONSTRAINT "AutorizacaoConvenio_cirurgiaId_fkey" FOREIGN KEY ("cirurgiaId") REFERENCES "Cirurgia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacaoItem" ADD CONSTRAINT "AutorizacaoItem_autorizacaoId_fkey" FOREIGN KEY ("autorizacaoId") REFERENCES "AutorizacaoConvenio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacaoItem" ADD CONSTRAINT "AutorizacaoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs (o Prisma não modela; só existem no SQL)
ALTER TABLE "AutorizacaoItem" ADD CONSTRAINT "AutorizacaoItem_qtd_solicitada_check" CHECK ("quantidadeSolicitada" > 0);
ALTER TABLE "AutorizacaoItem" ADD CONSTRAINT "AutorizacaoItem_qtd_autorizada_check" CHECK ("quantidadeAutorizada" >= 0);
ALTER TABLE "AutorizacaoItem" ADD CONSTRAINT "AutorizacaoItem_valor_check" CHECK ("valorAutorizado" IS NULL OR "valorAutorizado" >= 0);
ALTER TABLE "AutorizacaoConvenio" ADD CONSTRAINT "AutorizacaoConvenio_validade_check" CHECK ("validade" IS NULL OR "validade" >= "solicitadaEm");
ALTER TABLE "Glosa" ADD CONSTRAINT "Glosa_recurso_data_check" CHECK ("recurso" = 'NENHUM' OR "recursoEm" IS NOT NULL);
