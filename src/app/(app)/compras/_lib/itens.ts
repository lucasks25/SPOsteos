import { z } from "zod";

// limites de coluna (int4 / Decimal(14,2)): acima disso o banco recusava e o usuário via "Erro inesperado"
const QTD_MAX = 1_000_000;
const CUSTO_MAX = 999_999_999.99;

export const itemSchema = z.object({
  produtoId: z.string().min(1, "Selecione o produto"),
  quantidade: z.coerce.number().int("Quantidade deve ser inteira").min(1, "Quantidade mínima 1").max(QTD_MAX, "Quantidade máxima 1.000.000"),
  custoUnit: z.coerce.number({ error: "Custo inválido" }).min(0, "Custo inválido").max(CUSTO_MAX, "Custo unitário acima do limite"),
});

export const itensSchema = z.array(itemSchema).min(1, "Inclua ao menos um item");

/** Campo hidden com JSON dos itens → array validado. */
export const itensJson = () =>
  z
    .string({ error: "Inclua ao menos um item" })
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Itens inválidos" });
        return z.NEVER;
      }
    })
    .pipe(itensSchema);

export type ItemPedido = z.infer<typeof itemSchema>;
