-- M4 (docs/REVISAO.md seção 18): uma única conta bancária ATIVA por agência + conta. O retorno de cobrança e o de SISPAG
-- localizam a conta pela agência/conta do arquivo; com duas iguais a baixa iria para a primeira encontrada.
-- Normaliza como o código (só dígitos, sem zeros à esquerda): "0057"/"72192-0" = "57"/"721920".
-- Índice parcial por expressão: não é declarável no schema.prisma; conferido em 16/10/2026 que o `migrate diff` não
-- propõe removê-lo (diff vazio depois de aplicado). Se um dia propuser, apague essa linha do SQL gerado.
-- Se falhar por duplicata: inative (ativo = false) a conta repetida e rode de novo.
CREATE UNIQUE INDEX "ContaBancaria_banco_agencia_numero_ativa_key" ON "ContaBancaria" (
  ltrim(regexp_replace("agencia", '\D', '', 'g'), '0'),
  ltrim(regexp_replace("numero", '\D', '', 'g'), '0')
) WHERE "ativo" AND "tipo" = 'BANCO' AND "agencia" IS NOT NULL AND "numero" IS NOT NULL;
