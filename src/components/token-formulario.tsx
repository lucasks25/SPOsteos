import { CAMPO_TOKEN, novoTokenFormulario } from "@/lib/idempotencia";

/** Campo oculto com o token de idempotência do formulário (Server Component: o token nasce a cada renderização). */
export function TokenFormulario() {
  return <input type="hidden" name={CAMPO_TOKEN} value={novoTokenFormulario()} />;
}
