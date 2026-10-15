-- CreateTable
CREATE TABLE "FechamentoMes" (
    "mes" TEXT NOT NULL,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,

    CONSTRAINT "FechamentoMes_pkey" PRIMARY KEY ("mes")
);


ALTER TABLE "FechamentoMes" ADD CONSTRAINT "FechamentoMes_mes_formato" CHECK ("mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
