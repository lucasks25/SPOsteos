-- AlterTable
ALTER TABLE "RemessaCobrancaItem" ADD COLUMN     "vencimento" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FormularioEnviado" (
    "token" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormularioEnviado_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "FormularioEnviado_criadoEm_idx" ON "FormularioEnviado"("criadoEm");

