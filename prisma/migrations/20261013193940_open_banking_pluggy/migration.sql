-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN     "pluggyAccountId" TEXT,
ADD COLUMN     "pluggyItemId" TEXT,
ADD COLUMN     "sincronizadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExtratoLinha" ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'PLUGGY';

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_pluggyAccountId_key" ON "ContaBancaria"("pluggyAccountId");

