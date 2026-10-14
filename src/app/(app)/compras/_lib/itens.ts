import { z } from "zod";

export const itemSchema = z.object({
  produtoId: z.string().min(1, "Selecione o produto"),
  quantidade: z.coerce.number().int("Quantidade deve ser inteira").min(1, "Quantidade mínima 1"),
  custoUnit: z.coerce.number().min(0, "Custo inválido"),
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
