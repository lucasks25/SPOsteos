-- Aprovação dos dados de pagamento do favorecido (docs/REVISAO.md §19, achado S2).
-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN     "pagamentoAlteradoEm" TIMESTAMP(3),
ADD COLUMN     "pagamentoAlteradoPor" TEXT,
ADD COLUMN     "pagamentoAprovadoEm" TIMESTAMP(3),
ADD COLUMN     "pagamentoAprovadoHash" TEXT,
ADD COLUMN     "pagamentoAprovadoPor" TEXT;

-- Dados já cadastrados antes desta trava ficam aprovados "pela migração" (pagamentoAprovadoPor nulo), para não parar
-- os pagamentos em curso. O hash é o mesmo de hashDadosPagamento() (financeiro/_lib/favorecidos-aprovacao.ts):
-- sha256 hex de cnpj|bancoCodigo|agencia|conta|contaDigito|chavePix, nulo vira texto vazio.
UPDATE "Fornecedor" SET
  "pagamentoAprovadoHash" = encode(sha256(convert_to(concat_ws('|', COALESCE("cnpj", ''), COALESCE("bancoCodigo", ''), COALESCE("agencia", ''), COALESCE("conta", ''), COALESCE("contaDigito", ''), COALESCE("chavePix", '')), 'UTF8')), 'hex'),
  "pagamentoAprovadoEm" = CURRENT_TIMESTAMP;
