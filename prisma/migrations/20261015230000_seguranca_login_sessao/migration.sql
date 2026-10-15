-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TentativaLogin_chave_criadaEm_idx" ON "TentativaLogin"("chave", "criadaEm");

