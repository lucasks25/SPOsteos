-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "aprovadoEm" TIMESTAMP(3),
ADD COLUMN     "aprovadoPor" TEXT;


-- contas já existentes seguem como aprovadas (não mudam o comportamento de quem já usa)
UPDATE "ContaPagar" SET "aprovadoEm" = "criadoEm" WHERE "aprovadoEm" IS NULL;
