-- CreateEnum
CREATE TYPE "TipoPlano" AS ENUM ('RECEITA', 'DEDUCAO', 'CUSTO', 'DESPESA', 'RECEITA_FINANCEIRA', 'DESPESA_FINANCEIRA', 'IMPOSTO_LUCRO', 'NAO_RESULTADO');

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "centroCustoId" TEXT,
ADD COLUMN     "competencia" TIMESTAMP(3),
ADD COLUMN     "planoContaId" TEXT;

-- AlterTable
ALTER TABLE "ContaReceber" ADD COLUMN     "centroCustoId" TEXT,
ADD COLUMN     "competencia" TIMESTAMP(3),
ADD COLUMN     "planoContaId" TEXT;

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "centroCustoId" TEXT,
ADD COLUMN     "planoContaId" TEXT;

-- AlterTable
ALTER TABLE "PedidoVenda" ADD COLUMN     "centroCustoId" TEXT;

-- CreateTable
CREATE TABLE "PlanoConta" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPlano" NOT NULL,
    "paiId" TEXT,
    "analitica" BOOLEAN NOT NULL DEFAULT true,
    "chaveSistema" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanoConta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroCusto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentroCusto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanoConta_codigo_key" ON "PlanoConta"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "PlanoConta_chaveSistema_key" ON "PlanoConta"("chaveSistema");

-- CreateIndex
CREATE UNIQUE INDEX "CentroCusto_codigo_key" ON "CentroCusto"("codigo");

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "PlanoConta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "PlanoConta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "PlanoConta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanoConta" ADD CONSTRAINT "PlanoConta_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "PlanoConta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Plano de contas padrão (ids fixos para o backfill; o usuário pode editar depois)
INSERT INTO "PlanoConta" ("id","codigo","nome","tipo","paiId","analitica","chaveSistema") VALUES
  ('pc_1','1','Receitas','RECEITA'::"TipoPlano",NULL,false,NULL),
  ('pc_1.01','1.01','Receita de vendas','RECEITA'::"TipoPlano",'pc_1',true,'RECEITA_VENDA'),
  ('pc_1.02','1.02','Outras receitas','RECEITA'::"TipoPlano",'pc_1',true,NULL),
  ('pc_2','2','Deduções da receita','DEDUCAO'::"TipoPlano",NULL,false,NULL),
  ('pc_2.01','2.01','Impostos sobre vendas','DEDUCAO'::"TipoPlano",'pc_2',true,NULL),
  ('pc_2.02','2.02','Devoluções','DEDUCAO'::"TipoPlano",'pc_2',true,NULL),
  ('pc_2.03','2.03','Glosas','DEDUCAO'::"TipoPlano",'pc_2',true,'GLOSA'),
  ('pc_3','3','Custos','CUSTO'::"TipoPlano",NULL,false,NULL),
  ('pc_3.01','3.01','Custo da mercadoria vendida','CUSTO'::"TipoPlano",'pc_3',true,'CMV'),
  ('pc_3.02','3.02','Perdas e ajustes de estoque','CUSTO'::"TipoPlano",'pc_3',true,'PERDA_ESTOQUE'),
  ('pc_3.03','3.03','Fretes e custos de importação','CUSTO'::"TipoPlano",'pc_3',true,NULL),
  ('pc_4','4','Despesas operacionais','DESPESA'::"TipoPlano",NULL,false,NULL),
  ('pc_4.01','4.01','Pessoal','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_4.02','4.02','Ocupação (aluguel, condomínio, energia)','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_4.03','4.03','Logística','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_4.04','4.04','Serviços de terceiros','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_4.05','4.05','Comissões','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_4.06','4.06','Administrativas','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_4.07','4.07','Comerciais e marketing','DESPESA'::"TipoPlano",'pc_4',true,NULL),
  ('pc_5','5','Receitas financeiras','RECEITA_FINANCEIRA'::"TipoPlano",NULL,false,NULL),
  ('pc_5.01','5.01','Juros e multas recebidos','RECEITA_FINANCEIRA'::"TipoPlano",'pc_5',true,'JUROS_RECEBIDOS'),
  ('pc_5.02','5.02','Descontos obtidos','RECEITA_FINANCEIRA'::"TipoPlano",'pc_5',true,'DESCONTO_OBTIDO'),
  ('pc_5.03','5.03','Rendimentos de aplicação','RECEITA_FINANCEIRA'::"TipoPlano",'pc_5',true,NULL),
  ('pc_6','6','Despesas financeiras','DESPESA_FINANCEIRA'::"TipoPlano",NULL,false,NULL),
  ('pc_6.01','6.01','Juros e multas pagos','DESPESA_FINANCEIRA'::"TipoPlano",'pc_6',true,'JUROS_PAGOS'),
  ('pc_6.02','6.02','Descontos concedidos','DESPESA_FINANCEIRA'::"TipoPlano",'pc_6',true,'DESCONTO_CONCEDIDO'),
  ('pc_6.03','6.03','Tarifas bancárias','DESPESA_FINANCEIRA'::"TipoPlano",'pc_6',true,NULL),
  ('pc_7','7','Imposto sobre o lucro','IMPOSTO_LUCRO'::"TipoPlano",NULL,false,NULL),
  ('pc_7.01','7.01','IRPJ e CSLL','IMPOSTO_LUCRO'::"TipoPlano",'pc_7',true,NULL),
  ('pc_8','8','Fora do resultado','NAO_RESULTADO'::"TipoPlano",NULL,false,NULL),
  ('pc_8.01','8.01','Estoque (compra de mercadoria)','NAO_RESULTADO'::"TipoPlano",'pc_8',true,'ESTOQUE'),
  ('pc_8.02','8.02','Empréstimos e financiamentos','NAO_RESULTADO'::"TipoPlano",'pc_8',true,NULL),
  ('pc_8.03','8.03','Aportes e retiradas de sócios','NAO_RESULTADO'::"TipoPlano",'pc_8',true,NULL);

-- Backfill da competência: título de pedido = dia do faturamento em Brasília; senão o dia da criação em Brasília
UPDATE "ContaReceber" c SET "competencia" = date_trunc('day', COALESCE((SELECT p."faturadoEm" FROM "PedidoVenda" p WHERE p."id" = c."pedidoId"), c."criadoEm") AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') ;
UPDATE "ContaPagar" c SET "competencia" = date_trunc('day', c."criadoEm" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo');
ALTER TABLE "ContaReceber" ALTER COLUMN "competencia" SET NOT NULL;
ALTER TABLE "ContaPagar" ALTER COLUMN "competencia" SET NOT NULL;

-- Backfill da classificação (categorias ambíguas ficam sem plano = "Não classificado")
UPDATE "ContaReceber" SET "planoContaId" = 'pc_1.01' WHERE "pedidoId" IS NOT NULL;
UPDATE "ContaPagar" SET "planoContaId" = CASE "categoria"
  WHEN 'Compra de mercadoria' THEN 'pc_8.01'
  WHEN 'Folha' THEN 'pc_4.01'
  WHEN 'Aluguel' THEN 'pc_4.02'
  WHEN 'Logística' THEN 'pc_4.03'
  WHEN 'Serviços' THEN 'pc_4.04'
  ELSE NULL END;
UPDATE "Lancamento" SET "planoContaId" = CASE "categoria"
  WHEN 'Tarifa bancária' THEN 'pc_6.03'
  WHEN 'Rendimento' THEN 'pc_5.03'
  ELSE NULL END
WHERE "contaReceberId" IS NULL AND "contaPagarId" IS NULL AND "transferenciaId" IS NULL;

-- Travas (o Prisma não declara CHECK)
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_plano_so_no_avulso"
  CHECK ("planoContaId" IS NULL OR ("contaReceberId" IS NULL AND "contaPagarId" IS NULL AND "transferenciaId" IS NULL));
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_centro_so_no_avulso"
  CHECK ("centroCustoId" IS NULL OR ("contaReceberId" IS NULL AND "contaPagarId" IS NULL AND "transferenciaId" IS NULL));
ALTER TABLE "PlanoConta" ADD CONSTRAINT "PlanoConta_pai_diferente" CHECK ("paiId" IS NULL OR "paiId" <> "id");
ALTER TABLE "PlanoConta" ADD CONSTRAINT "PlanoConta_codigo_formato" CHECK ("codigo" ~ '^[0-9]+(\.[0-9]+)*$');
