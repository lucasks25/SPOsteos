-- Correções de DRE (docs/REVISAO.md seção 18). Só dados; nenhuma mudança de schema.
-- ATENÇÃO: altera o DRE ("Perdas e ajustes de estoque") dos meses em que houve estes movimentos, inclusive meses já
-- fechados (o DRE é recalculado na leitura; o fechamento não guarda foto). Na base de desenvolvimento: 0 linhas.

-- A4: estorno de consumo de cirurgia era AJUSTE só com destino (contava como GANHO de estoque no DRE). O consumo nunca
-- entrou como perda (vira custo pelo CMV no faturamento), então o estorno é devolução ao consignado: RETORNO.
UPDATE "Movimento"
SET "tipo" = 'RETORNO'
WHERE "tipo" = 'AJUSTE' AND "documento" LIKE 'CIR-%' AND "observacao" = 'estorno' AND "origemId" IS NULL AND "destinoId" IS NOT NULL;

-- M6: falta de inventário com resolução "cobrar do hospital" (AJUSTE de saída) recebe a marca COBRAR_HOSPITAL no início
-- da observação; o DRE deixa de contá-la como perda (o hospital responde pelo valor).
UPDATE "Movimento"
SET "observacao" = 'COBRAR_HOSPITAL — ' || "observacao"
WHERE "tipo" = 'AJUSTE' AND "documento" LIKE 'INV-%' AND "origemId" IS NOT NULL AND "destinoId" IS NULL
  AND "observacao" LIKE 'Inventário INV-%: falta a cobrar do hospital%';
