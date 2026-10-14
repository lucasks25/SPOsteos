import { Field, Form, Select } from "@/components/form";
import type { ActionState } from "@/lib/forms";

type Opt = { value: string; label: string };

/**
 * Formulário em linha para adicionar um item (produto + quantidade [+ preço]) a um documento.
 * A action recebe FormData com `produtoId`, `quantidade` e, se `comPreco`, `preco`.
 */
export function ItemAdder({
  action,
  produtos,
  comPreco,
  comQuantidade = true,
  label = "Adicionar",
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  produtos: Opt[];
  comPreco?: boolean;
  comQuantidade?: boolean;
  label?: string;
}) {
  return (
    <Form action={action} submitLabel={label} resetOnSuccess className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_7rem_9rem_auto] [&>div:last-child]:pt-0">
      <Select label="Produto" name="produtoId" options={produtos} required />
      {comQuantidade ? <Field label="Qtd." name="quantidade" type="number" min="1" defaultValue={1} required /> : <div />}
      {comPreco ? <Field label="Preço (R$)" name="preco" type="number" step="0.01" min="0" hint="vazio = preço base" /> : <div />}
    </Form>
  );
}

/** Opções de produto ativos para selects. */
export function produtoOptions(produtos: { id: string; codigo: string; descricao: string }[]): Opt[] {
  return produtos.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` }));
}
