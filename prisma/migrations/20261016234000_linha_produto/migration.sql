-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "linhaId" TEXT;

-- CreateTable
CREATE TABLE "LinhaProduto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LinhaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinhaProduto_codigo_key" ON "LinhaProduto"("codigo");

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaProduto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Linhas iniciais da SP OSTEOS (docs/ALINHAMENTO-SPOSTEOS.md §4). Lista editável pelo cadastro.
INSERT INTO "LinhaProduto" ("id", "codigo", "nome", "grupo", "ordem") VALUES
  ('linha-col-fix',  'COL-FIX',  'Coluna – fixação',                 'Implantáveis',  10),
  ('linha-col-cage', 'COL-CAGE', 'Coluna – cages e artrodese',       'Implantáveis',  20),
  ('linha-col-def',  'COL-DEF',  'Coluna – deformidade',             'Implantáveis',  30),
  ('linha-bio-cim',  'BIO-CIM',  'Cimento ósseo',                    'Biológicos',    40),
  ('linha-bio-enx',  'BIO-ENX',  'Enxertos ósseos',                  'Biológicos',    50),
  ('linha-bio-hem',  'BIO-HEM',  'Hemostáticos e barreiras',         'Biológicos',    60),
  ('linha-bio-vis',  'BIO-VIS',  'Viscossuplementação',              'Biológicos',    70),
  ('linha-dor',      'DOR',      'Dor e intervenção',                'Descartáveis',  80),
  ('linha-end',      'END',      'Endoscopia de coluna',             'Descartáveis',  90),
  ('linha-vtp',      'VTP',      'Vertebroplastia e cifoplastia',    'Descartáveis', 100),
  ('linha-col-desc', 'COL-DESC', 'Coluna – descartáveis de apoio',   'Descartáveis', 110),
  ('linha-ins',      'INS',      'Instrumentais',                    'Instrumentais',120)
ON CONFLICT ("codigo") DO NOTHING;
