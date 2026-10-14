-- DropIndex
DROP INDEX "ContaBancaria_pluggyAccountId_key";

-- AlterTable
ALTER TABLE "ContaBancaria" DROP COLUMN "pluggyAccountId",
DROP COLUMN "pluggyItemId",
DROP COLUMN "sincronizadoEm";

-- AlterTable
ALTER TABLE "ExtratoLinha" ALTER COLUMN "origem" SET DEFAULT 'OFX';

