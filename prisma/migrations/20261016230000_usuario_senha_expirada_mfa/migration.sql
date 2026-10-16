-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "mfaAtivadoEm" TIMESTAMP(3),
ADD COLUMN     "mfaRecuperacao" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaSegredo" TEXT,
ADD COLUMN     "mfaUltimoPasso" INTEGER,
ADD COLUMN     "senhaExpirada" BOOLEAN NOT NULL DEFAULT false;

