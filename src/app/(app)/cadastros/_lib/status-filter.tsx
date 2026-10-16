/** Select de status (ativos/inativos/todos) para usar dentro do SearchBar (GET ?status=). */
export function StatusFilter({ value }: { value?: string }) {
  return (
    <select
      name="status"
      aria-label="Situação do cadastro"
      defaultValue={value ?? ""}
      className="h-10 rounded-lg border border-field bg-white px-3 text-sm text-slate-900 hover:border-slate-500 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-500/20"
    >
      <option value="">Ativos</option>
      <option value="inativos">Inativos</option>
      <option value="todos">Todos</option>
    </select>
  );
}

/** Converte ?status= em filtro Prisma sobre o campo `ativo`. */
export function ativoWhere(status?: string) {
  if (status === "todos") return {};
  return { ativo: status !== "inativos" };
}
