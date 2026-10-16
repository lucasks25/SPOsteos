-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('AFE', 'LICENCA_SANITARIA', 'CBPAD', 'ALVARA', 'CERTIFICADO_BPF', 'AUTORIZACAO_COMERCIALIZACAO', 'REGISTRO_ANVISA', 'IFU', 'LAUDO', 'CONTRATO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EscopoDocumento" AS ENUM ('EMPRESA', 'FORNECEDOR', 'FABRICANTE', 'PRODUTO');

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "titulo" TEXT NOT NULL,
    "numero" TEXT,
    "orgaoEmissor" TEXT,
    "emissao" TIMESTAMP(3),
    "validade" TIMESTAMP(3),
    "escopo" "EscopoDocumento" NOT NULL,
    "fornecedorId" TEXT,
    "fabricanteId" TEXT,
    "produtoId" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "substituidoPorId" TEXT,
    "substituidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoArquivo" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPor" TEXT,

    CONSTRAINT "DocumentoArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Documento_substituidoPorId_key" ON "Documento"("substituidoPorId");

-- CreateIndex
CREATE INDEX "Documento_escopo_tipo_idx" ON "Documento"("escopo", "tipo");

-- CreateIndex
CREATE INDEX "Documento_validade_idx" ON "Documento"("validade");

-- CreateIndex
CREATE INDEX "Documento_fornecedorId_idx" ON "Documento"("fornecedorId");

-- CreateIndex
CREATE INDEX "Documento_fabricanteId_idx" ON "Documento"("fabricanteId");

-- CreateIndex
CREATE INDEX "Documento_produtoId_idx" ON "Documento"("produtoId");

-- CreateIndex
CREATE INDEX "DocumentoArquivo_documentoId_criadoEm_idx" ON "DocumentoArquivo"("documentoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "Fabricante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_substituidoPorId_fkey" FOREIGN KEY ("substituidoPorId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoArquivo" ADD CONSTRAINT "DocumentoArquivo_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───── Travas ─────
-- exatamente a FK do escopo preenchida; EMPRESA não tem nenhuma
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_escopo_check" CHECK (
  ("escopo" = 'EMPRESA'    AND "fornecedorId" IS NULL     AND "fabricanteId" IS NULL     AND "produtoId" IS NULL) OR
  ("escopo" = 'FORNECEDOR' AND "fornecedorId" IS NOT NULL AND "fabricanteId" IS NULL     AND "produtoId" IS NULL) OR
  ("escopo" = 'FABRICANTE' AND "fornecedorId" IS NULL     AND "fabricanteId" IS NOT NULL AND "produtoId" IS NULL) OR
  ("escopo" = 'PRODUTO'    AND "fornecedorId" IS NULL     AND "fabricanteId" IS NULL     AND "produtoId" IS NOT NULL)
);
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_titulo_check" CHECK (length(btrim("titulo")) > 0);
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_datas_check" CHECK ("emissao" IS NULL OR "validade" IS NULL OR "validade" >= "emissao");
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_substitui_si_check" CHECK ("substituidoPorId" IS NULL OR "substituidoPorId" <> "id");
-- substituído tem data da substituição
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_substituido_check" CHECK (("substituidoPorId" IS NULL) = ("substituidoEm" IS NULL));
ALTER TABLE "DocumentoArquivo" ADD CONSTRAINT "DocumentoArquivo_tamanho_check" CHECK ("tamanho" > 0 AND "tamanho" <= 10485760);
ALTER TABLE "DocumentoArquivo" ADD CONSTRAINT "DocumentoArquivo_hash_check" CHECK ("hash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "DocumentoArquivo" ADD CONSTRAINT "DocumentoArquivo_mime_check" CHECK ("mime" IN ('application/pdf', 'image/png', 'image/jpeg'));
ALTER TABLE "DocumentoArquivo" ADD CONSTRAINT "DocumentoArquivo_caminho_check" CHECK ("caminho" ~ '^[a-f0-9-]{36}\.(pdf|png|jpg)$');
