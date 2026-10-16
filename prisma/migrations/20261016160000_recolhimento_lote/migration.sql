-- CreateEnum
CREATE TYPE "OrigemRecolhimento" AS ENUM ('ANVISA', 'FABRICANTE', 'INTERNO');

-- CreateEnum
CREATE TYPE "ClasseRecolhimento" AS ENUM ('I', 'II', 'III');

-- CreateEnum
CREATE TYPE "StatusRecolhimento" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusAlvoRecolhimento" AS ENUM ('PENDENTE', 'COMUNICADO', 'RECOLHIDO', 'SEM_SALDO');

-- CreateTable
CREATE TABLE "Recolhimento" (
    "id" SERIAL NOT NULL,
    "origem" "OrigemRecolhimento" NOT NULL,
    "classe" "ClasseRecolhimento" NOT NULL,
    "motivo" TEXT NOT NULL,
    "referencia" TEXT,
    "prazo" TIMESTAMP(3),
    "status" "StatusRecolhimento" NOT NULL DEFAULT 'ABERTO',
    "observacao" TEXT,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abertoPor" TEXT NOT NULL,
    "concluidoEm" TIMESTAMP(3),
    "concluidoPor" TEXT,
    "conclusao" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "canceladoPor" TEXT,
    "motivoCancelamento" TEXT,

    CONSTRAINT "Recolhimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecolhimentoLote" (
    "id" TEXT NOT NULL,
    "recolhimentoId" INTEGER NOT NULL,
    "loteId" TEXT NOT NULL,
    "statusAnterior" "StatusLote" NOT NULL,
    "bloqueadoPorEste" BOOLEAN NOT NULL,

    CONSTRAINT "RecolhimentoLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecolhimentoAlvo" (
    "id" TEXT NOT NULL,
    "recolhimentoId" INTEGER NOT NULL,
    "loteId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "saldoAbertura" INTEGER NOT NULL,
    "quantidadeRecolhida" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusAlvoRecolhimento" NOT NULL DEFAULT 'PENDENTE',
    "comunicadoEm" TIMESTAMP(3),
    "recolhidoEm" TIMESTAMP(3),
    "justificativa" TEXT,
    "saldoFinal" INTEGER,

    CONSTRAINT "RecolhimentoAlvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecolhimentoPaciente" (
    "id" TEXT NOT NULL,
    "recolhimentoId" INTEGER NOT NULL,
    "consumoId" TEXT NOT NULL,
    "cirurgiaId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "comunicadoEm" TIMESTAMP(3),
    "observacao" TEXT,

    CONSTRAINT "RecolhimentoPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecolhimentoAcao" (
    "id" TEXT NOT NULL,
    "recolhimentoId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "RecolhimentoAcao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recolhimento_status_idx" ON "Recolhimento"("status");

-- CreateIndex
CREATE INDEX "RecolhimentoLote_loteId_idx" ON "RecolhimentoLote"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "RecolhimentoLote_recolhimentoId_loteId_key" ON "RecolhimentoLote"("recolhimentoId", "loteId");

-- CreateIndex
CREATE INDEX "RecolhimentoAlvo_localId_idx" ON "RecolhimentoAlvo"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "RecolhimentoAlvo_recolhimentoId_loteId_localId_key" ON "RecolhimentoAlvo"("recolhimentoId", "loteId", "localId");

-- CreateIndex
CREATE INDEX "RecolhimentoPaciente_cirurgiaId_idx" ON "RecolhimentoPaciente"("cirurgiaId");

-- CreateIndex
CREATE UNIQUE INDEX "RecolhimentoPaciente_recolhimentoId_consumoId_key" ON "RecolhimentoPaciente"("recolhimentoId", "consumoId");

-- CreateIndex
CREATE INDEX "RecolhimentoAcao_recolhimentoId_criadoEm_idx" ON "RecolhimentoAcao"("recolhimentoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "RecolhimentoLote" ADD CONSTRAINT "RecolhimentoLote_recolhimentoId_fkey" FOREIGN KEY ("recolhimentoId") REFERENCES "Recolhimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoLote" ADD CONSTRAINT "RecolhimentoLote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoAlvo" ADD CONSTRAINT "RecolhimentoAlvo_recolhimentoId_fkey" FOREIGN KEY ("recolhimentoId") REFERENCES "Recolhimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoAlvo" ADD CONSTRAINT "RecolhimentoAlvo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoAlvo" ADD CONSTRAINT "RecolhimentoAlvo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "LocalEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoPaciente" ADD CONSTRAINT "RecolhimentoPaciente_recolhimentoId_fkey" FOREIGN KEY ("recolhimentoId") REFERENCES "Recolhimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoPaciente" ADD CONSTRAINT "RecolhimentoPaciente_cirurgiaId_fkey" FOREIGN KEY ("cirurgiaId") REFERENCES "Cirurgia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoPaciente" ADD CONSTRAINT "RecolhimentoPaciente_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecolhimentoAcao" ADD CONSTRAINT "RecolhimentoAcao_recolhimentoId_fkey" FOREIGN KEY ("recolhimentoId") REFERENCES "Recolhimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Travas que o Prisma não expressa
ALTER TABLE "RecolhimentoAlvo" ADD CONSTRAINT "RecolhimentoAlvo_saldoAbertura_check" CHECK ("saldoAbertura" >= 0);
ALTER TABLE "RecolhimentoAlvo" ADD CONSTRAINT "RecolhimentoAlvo_quantidadeRecolhida_check" CHECK ("quantidadeRecolhida" >= 0);
ALTER TABLE "RecolhimentoAlvo" ADD CONSTRAINT "RecolhimentoAlvo_saldoFinal_check" CHECK ("saldoFinal" IS NULL OR "saldoFinal" >= 0);
ALTER TABLE "RecolhimentoPaciente" ADD CONSTRAINT "RecolhimentoPaciente_quantidade_check" CHECK ("quantidade" > 0);
ALTER TABLE "Recolhimento" ADD CONSTRAINT "Recolhimento_motivo_check" CHECK (length(btrim("motivo")) > 0);
ALTER TABLE "Recolhimento" ADD CONSTRAINT "Recolhimento_concluido_check" CHECK ("status" <> 'CONCLUIDO' OR ("concluidoEm" IS NOT NULL AND "concluidoPor" IS NOT NULL));
ALTER TABLE "Recolhimento" ADD CONSTRAINT "Recolhimento_cancelado_check" CHECK ("status" <> 'CANCELADO' OR ("canceladoEm" IS NOT NULL AND "canceladoPor" IS NOT NULL));
