-- O dinheiro de uma baixa é principal + juros + multa. O desconto extingue parte do título sem dinheiro
-- (título 1000 pago com 980 e 20 de desconto: principal 980, desconto 20). A trava anterior subtraía o desconto.
ALTER TABLE "Lancamento" DROP CONSTRAINT "Lancamento_valor_fecha_com_componentes";
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_valor_fecha_com_componentes"
  CHECK ("principal" IS NULL OR "valor" = "principal" + "juros" + "multa");
