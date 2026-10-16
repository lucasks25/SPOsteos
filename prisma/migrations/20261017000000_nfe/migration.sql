-- CreateEnum
CREATE TYPE "TipoNotaFiscal" AS ENUM ('REMESSA_CONSIGNACAO', 'RETORNO_CONSIGNACAO', 'RETORNO_SIMBOLICO', 'VENDA_CONSIGNADO', 'VENDA', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "StatusNotaFiscal" AS ENUM ('RASCUNHO', 'ENVIADA', 'AUTORIZADA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoEventoNotaFiscal" AS ENUM ('MONTAGEM', 'ENVIO', 'AUTORIZACAO', 'REJEICAO', 'CONSULTA', 'EFEITO', 'CANCELAMENTO', 'CARTA_CORRECAO', 'ERRO');

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "cest" TEXT,
ADD COLUMN     "origem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unidadeTributavel" TEXT;

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoNotaFiscal" NOT NULL,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'RASCUNHO',
    "entrada" BOOLEAN NOT NULL,
    "naturezaOperacao" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "numero" INTEGER,
    "serie" INTEGER,
    "chave" TEXT,
    "protocolo" TEXT,
    "destNome" TEXT NOT NULL,
    "destDocumento" TEXT,
    "destIe" TEXT,
    "destEndereco" TEXT,
    "destBairro" TEXT,
    "destCep" TEXT,
    "destMunicipio" TEXT,
    "destUf" TEXT NOT NULL,
    "destPais" TEXT,
    "hospitalId" TEXT,
    "fornecedorId" TEXT,
    "pedidoVendaId" INTEGER,
    "remessaId" INTEGER,
    "pedidoCompraId" INTEGER,
    "valorProdutos" DECIMAL(14,2) NOT NULL,
    "valorFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorSeguro" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorOutros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorII" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIpi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcms" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorPis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorCofins" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "chavesReferenciadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "informacoesComplementares" TEXT,
    "importacao" JSONB,
    "vencimento" TIMESTAMP(3),
    "xmlUrl" TEXT,
    "danfeUrl" TEXT,
    "mensagem" TEXT,
    "efeitoAplicadoEm" TIMESTAMP(3),
    "efeitoPendente" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadaEm" TIMESTAMP(3),
    "autorizadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscalItem" (
    "id" TEXT NOT NULL,
    "notaId" INTEGER NOT NULL,
    "numeroItem" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "cest" TEXT,
    "gtin" TEXT,
    "cfop" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valorUnitario" DECIMAL(16,4) NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "origem" INTEGER NOT NULL,
    "cstIcms" TEXT NOT NULL,
    "aliquotaIcms" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "baseIcms" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcms" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cstIpi" TEXT NOT NULL,
    "aliquotaIpi" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorIpi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cstPis" TEXT NOT NULL,
    "aliquotaPis" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorPis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cstCofins" TEXT NOT NULL,
    "aliquotaCofins" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorCofins" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorII" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loteNumero" TEXT,
    "loteFabricacao" TIMESTAMP(3),
    "loteValidade" TIMESTAMP(3),
    "registroAnvisa" TEXT,

    CONSTRAINT "NotaFiscalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscalEvento" (
    "id" TEXT NOT NULL,
    "notaId" INTEGER NOT NULL,
    "tipo" "TipoEventoNotaFiscal" NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "sequencia" INTEGER,
    "protocolo" TEXT,
    "texto" TEXT,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaFiscalEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_referencia_key" ON "NotaFiscal"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_chave_key" ON "NotaFiscal"("chave");

-- CreateIndex
CREATE INDEX "NotaFiscal_status_criadoEm_idx" ON "NotaFiscal"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "NotaFiscal_pedidoVendaId_idx" ON "NotaFiscal"("pedidoVendaId");

-- CreateIndex
CREATE INDEX "NotaFiscal_remessaId_idx" ON "NotaFiscal"("remessaId");

-- CreateIndex
CREATE INDEX "NotaFiscal_pedidoCompraId_idx" ON "NotaFiscal"("pedidoCompraId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscalItem_notaId_numeroItem_key" ON "NotaFiscalItem"("notaId", "numeroItem");

-- CreateIndex
CREATE INDEX "NotaFiscalEvento_notaId_criadoEm_idx" ON "NotaFiscalEvento"("notaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "Remessa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalItem" ADD CONSTRAINT "NotaFiscalItem_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalItem" ADD CONSTRAINT "NotaFiscalItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscalEvento" ADD CONSTRAINT "NotaFiscalEvento_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Travas que o Prisma não declara (manter ao gerar migrations futuras com migrate diff) ──
-- Uma nota ATIVA (não rejeitada nem cancelada) por tipo e origem: dois cliques em "Emitir" não geram duas notas.
CREATE UNIQUE INDEX "NotaFiscal_origem_ativa_key" ON "NotaFiscal" ("tipo", COALESCE("pedidoVendaId", 0), COALESCE("remessaId", 0), COALESCE("pedidoCompraId", 0))
  WHERE "status" NOT IN ('REJEITADA', 'CANCELADA');
-- Exatamente uma origem por nota.
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_uma_origem_chk" CHECK (num_nonnulls("pedidoVendaId", "remessaId", "pedidoCompraId") = 1);
-- Autorizada e cancelada têm chave de 44 dígitos e protocolo.
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_chave_chk" CHECK ("chave" IS NULL OR "chave" ~ '^[0-9]{44}$');
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_autorizada_chk" CHECK ("status" NOT IN ('AUTORIZADA', 'CANCELADA') OR ("chave" IS NOT NULL AND "protocolo" IS NOT NULL AND "numero" IS NOT NULL));
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_valores_chk" CHECK ("valorProdutos" >= 0 AND "valorTotal" >= 0);
ALTER TABLE "NotaFiscalItem" ADD CONSTRAINT "NotaFiscalItem_valores_chk" CHECK ("quantidade" > 0 AND "valorUnitario" >= 0 AND "valorTotal" >= 0 AND "numeroItem" BETWEEN 1 AND 990);
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_origem_chk" CHECK ("origem" BETWEEN 0 AND 8);
