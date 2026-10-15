-- CreateTable
CREATE TABLE "Glosa" (
    "id" TEXT NOT NULL,
    "contaReceberId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Glosa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Glosa_contaReceberId_idx" ON "Glosa"("contaReceberId");

-- CreateIndex
CREATE INDEX "Glosa_data_idx" ON "Glosa"("data");

-- AddForeignKey
ALTER TABLE "Glosa" ADD CONSTRAINT "Glosa_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Glosa" ADD CONSTRAINT "Glosa_valor_positivo" CHECK ("valor" > 0);
