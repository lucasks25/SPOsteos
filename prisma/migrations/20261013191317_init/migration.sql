-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'COMERCIAL', 'ESTOQUE', 'QUALIDADE', 'COMPRAS', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "StatusLote" AS ENUM ('QUARENTENA', 'LIBERADO', 'NAO_CONFORME', 'BLOQUEADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "TipoLocal" AS ENUM ('DEPOSITO', 'HOSPITAL', 'QUARENTENA', 'NAO_CONFORME');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRADA', 'REMESSA', 'RETORNO', 'CONSUMO', 'TRANSFERENCIA', 'AJUSTE', 'PERDA');

-- CreateEnum
CREATE TYPE "StatusRemessa" AS ENUM ('ABERTA', 'ENVIADA', 'CONFERIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCirurgia" AS ENUM ('AGENDADA', 'CONFIRMADA', 'REALIZADA', 'FATURADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "StatusPedidoVenda" AS ENUM ('ABERTO', 'FATURADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('ABERTO', 'PARCIAL', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusTitulo" AS ENUM ('ABERTO', 'PAGO', 'CANCELADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'COMERCIAL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "detalhes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fabricante" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "pais" TEXT,

    CONSTRAINT "Fabricante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "afe" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "ie" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "prazoPagamentoDias" INTEGER NOT NULL DEFAULT 30,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tabelaPrecoId" TEXT,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "crm" TEXT NOT NULL,
    "ufCrm" TEXT NOT NULL,
    "especialidade" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Convenio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "registroAns" TEXT,
    "cnpj" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Convenio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedimento" (
    "id" TEXT NOT NULL,
    "codigoTuss" TEXT,
    "descricao" TEXT NOT NULL,
    "especialidade" TEXT,

    CONSTRAINT "Procedimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedimentoItem" (
    "id" TEXT NOT NULL,
    "procedimentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProcedimentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Representante" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "comissaoPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Representante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "referencia" TEXT,
    "fabricanteId" TEXT,
    "registroAnvisa" TEXT,
    "validadeRegistro" TIMESTAMP(3),
    "classeRisco" TEXT,
    "gtin" TEXT,
    "ncm" TEXT,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "custoMedio" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "precoBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estoqueMinimo" INTEGER NOT NULL DEFAULT 0,
    "controlaLote" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT,
    "fabricacao" TIMESTAMP(3),
    "validade" TIMESTAMP(3) NOT NULL,
    "status" "StatusLote" NOT NULL DEFAULT 'QUARENTENA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspecao" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "resultado" "StatusLote" NOT NULL,
    "embalagemOk" BOOLEAN NOT NULL DEFAULT true,
    "rotulagemOk" BOOLEAN NOT NULL DEFAULT true,
    "documentacaoOk" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "inspetor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalEstoque" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLocal" NOT NULL,
    "hospitalId" TEXT,

    CONSTRAINT "LocalEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saldo" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Saldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "origemId" TEXT,
    "destinoId" TEXT,
    "quantidade" INTEGER NOT NULL,
    "custoUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "documento" TEXT,
    "observacao" TEXT,
    "usuario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kit" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "Kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitItem" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "KitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remessa" (
    "id" SERIAL NOT NULL,
    "localId" TEXT NOT NULL,
    "cirurgiaId" TEXT,
    "kitId" TEXT,
    "status" "StatusRemessa" NOT NULL DEFAULT 'ABERTA',
    "observacao" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "conferidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remessa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemessaItem" (
    "id" TEXT NOT NULL,
    "remessaId" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "devolvido" INTEGER NOT NULL DEFAULT 0,
    "consumido" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RemessaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPreco" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFim" TIMESTAMP(3),

    CONSTRAINT "TabelaPreco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPrecoItem" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "preco" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "TabelaPrecoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cirurgia" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "convenioId" TEXT,
    "procedimentoId" TEXT,
    "representanteId" TEXT,
    "paciente" TEXT NOT NULL,
    "carteirinha" TEXT,
    "sus" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusCirurgia" NOT NULL DEFAULT 'AGENDADA',
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cirurgia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CirurgiaConsumo" (
    "id" TEXT NOT NULL,
    "cirurgiaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "CirurgiaConsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "cirurgiaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" SERIAL NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "convenioId" TEXT,
    "paciente" TEXT,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "validade" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoItem" (
    "id" TEXT NOT NULL,
    "orcamentoId" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnit" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVenda" (
    "id" SERIAL NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "cirurgiaId" TEXT,
    "representanteId" TEXT,
    "status" "StatusPedidoVenda" NOT NULL DEFAULT 'ABERTO',
    "numeroNf" TEXT,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custoTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "comissao" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "faturadoEm" TIMESTAMP(3),

    CONSTRAINT "PedidoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoVendaItem" (
    "id" TEXT NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "loteNumero" TEXT,
    "quantidade" INTEGER NOT NULL,
    "precoUnit" DECIMAL(14,2) NOT NULL,
    "custoUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PedidoVendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" SERIAL NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'ABERTO',
    "previsao" TIMESTAMP(3),
    "importacao" BOOLEAN NOT NULL DEFAULT false,
    "invoice" TEXT,
    "numeroDi" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompraItem" (
    "id" TEXT NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "recebido" INTEGER NOT NULL DEFAULT 0,
    "custoUnit" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PedidoCompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaReceber" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "hospitalId" TEXT,
    "pedidoId" INTEGER,
    "valor" DECIMAL(14,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusTitulo" NOT NULL DEFAULT 'ABERTO',
    "valorPago" DECIMAL(14,2),
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaReceber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "pedidoId" INTEGER,
    "categoria" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusTitulo" NOT NULL DEFAULT 'ABERTO',
    "valorPago" DECIMAL(14,2),
    "pagoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "LogAuditoria_entidade_entidadeId_idx" ON "LogAuditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_cnpj_key" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_cnpj_key" ON "Hospital"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Medico_crm_ufCrm_key" ON "Medico"("crm", "ufCrm");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigo_key" ON "Produto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_produtoId_numero_key" ON "Lote"("produtoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "LocalEstoque_hospitalId_key" ON "LocalEstoque"("hospitalId");

-- CreateIndex
CREATE INDEX "Saldo_produtoId_idx" ON "Saldo"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Saldo_loteId_localId_key" ON "Saldo"("loteId", "localId");

-- CreateIndex
CREATE INDEX "Movimento_produtoId_criadoEm_idx" ON "Movimento"("produtoId", "criadoEm");

-- CreateIndex
CREATE INDEX "Movimento_loteId_idx" ON "Movimento"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX "Kit_codigo_key" ON "Kit"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "TabelaPrecoItem_tabelaId_produtoId_key" ON "TabelaPrecoItem"("tabelaId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cirurgia_numero_key" ON "Cirurgia"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoVenda_cirurgiaId_key" ON "PedidoVenda"("cirurgiaId");

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_tabelaPrecoId_fkey" FOREIGN KEY ("tabelaPrecoId") REFERENCES "TabelaPreco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoItem" ADD CONSTRAINT "ProcedimentoItem_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "Procedimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoItem" ADD CONSTRAINT "ProcedimentoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "Fabricante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspecao" ADD CONSTRAINT "Inspecao_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalEstoque" ADD CONSTRAINT "LocalEstoque_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldo" ADD CONSTRAINT "Saldo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldo" ADD CONSTRAINT "Saldo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldo" ADD CONSTRAINT "Saldo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "LocalEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimento" ADD CONSTRAINT "Movimento_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimento" ADD CONSTRAINT "Movimento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimento" ADD CONSTRAINT "Movimento_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimento" ADD CONSTRAINT "Movimento_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "LocalEstoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remessa" ADD CONSTRAINT "Remessa_localId_fkey" FOREIGN KEY ("localId") REFERENCES "LocalEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remessa" ADD CONSTRAINT "Remessa_cirurgiaId_fkey" FOREIGN KEY ("cirurgiaId") REFERENCES "Cirurgia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remessa" ADD CONSTRAINT "Remessa_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaItem" ADD CONSTRAINT "RemessaItem_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "Remessa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaItem" ADD CONSTRAINT "RemessaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemessaItem" ADD CONSTRAINT "RemessaItem_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPrecoItem" ADD CONSTRAINT "TabelaPrecoItem_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "TabelaPreco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabelaPrecoItem" ADD CONSTRAINT "TabelaPrecoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cirurgia" ADD CONSTRAINT "Cirurgia_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cirurgia" ADD CONSTRAINT "Cirurgia_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cirurgia" ADD CONSTRAINT "Cirurgia_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cirurgia" ADD CONSTRAINT "Cirurgia_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "Procedimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cirurgia" ADD CONSTRAINT "Cirurgia_representanteId_fkey" FOREIGN KEY ("representanteId") REFERENCES "Representante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirurgiaConsumo" ADD CONSTRAINT "CirurgiaConsumo_cirurgiaId_fkey" FOREIGN KEY ("cirurgiaId") REFERENCES "Cirurgia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirurgiaConsumo" ADD CONSTRAINT "CirurgiaConsumo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirurgiaConsumo" ADD CONSTRAINT "CirurgiaConsumo_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_cirurgiaId_fkey" FOREIGN KEY ("cirurgiaId") REFERENCES "Cirurgia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "Convenio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_cirurgiaId_fkey" FOREIGN KEY ("cirurgiaId") REFERENCES "Cirurgia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_representanteId_fkey" FOREIGN KEY ("representanteId") REFERENCES "Representante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoVendaItem" ADD CONSTRAINT "PedidoVendaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompraItem" ADD CONSTRAINT "PedidoCompraItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
